-- =============================================================================
-- Background Jobs & Observability Schema
-- Run once in: Supabase Dashboard → SQL Editor → New query
-- =============================================================================

-- ── 1. New columns on existing tables ────────────────────────────────────────

-- Track when a route lost GPS signal
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS signal_lost_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_gps_at     timestamptz;

-- Delivery confirmation columns (added by delivery_proof_schema.sql — safe to repeat)
ALTER TABLE shipment_details
  ADD COLUMN IF NOT EXISTS delivery_confirmed    boolean     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamptz;

-- Track the exact timestamp a shipment was marked as delivered
-- (used by the "unconfirmed > 72h" job — avoids using created_at as a proxy)
ALTER TABLE shipment_details
  ADD COLUMN IF NOT EXISTS delivered_at          timestamptz;

-- Extend request status to include 'expired'
-- If your table uses a CHECK constraint, update it first:
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE requests
  ADD CONSTRAINT requests_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'expired'));

-- ── 2. Trigger: auto-set delivered_at on status → 'dorëzuar' ─────────────────

CREATE OR REPLACE FUNCTION fn_set_delivered_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- Only set once — on the first transition to 'dorëzuar'
  IF NEW.shipment_status = 'dorëzuar'
     AND (OLD.shipment_status IS DISTINCT FROM 'dorëzuar')
     AND NEW.delivered_at IS NULL
  THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_delivered_at ON shipment_details;
CREATE TRIGGER trg_set_delivered_at
  BEFORE UPDATE ON shipment_details
  FOR EACH ROW EXECUTE FUNCTION fn_set_delivered_at();

-- Backfill existing delivered shipments (delivered_at = created_at as a proxy)
UPDATE shipment_details
SET delivered_at = created_at
WHERE shipment_status = 'dorëzuar'
  AND delivered_at IS NULL;

-- ── 3. system_events — central event log ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text        NOT NULL,
  -- 'signal_lost' | 'request_expired' | 'unconfirmed_delivery'
  -- | 'idle_route' | 'job_success' | 'job_error' | 'manual_trigger'
  source      text        NOT NULL,   -- job/function name
  severity    text        NOT NULL DEFAULT 'info',
  -- 'info' | 'warning' | 'error' | 'critical'
  message     text        NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sysevt_created  ON system_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sysevt_severity ON system_events (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sysevt_type     ON system_events (event_type, created_at DESC);

ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;

-- Only admins may read/write system events
DROP POLICY IF EXISTS "sysevt_admin" ON system_events;
CREATE POLICY "sysevt_admin"
  ON system_events FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Service-role (Edge Functions + pg_cron) bypass RLS automatically — no extra policy needed.

-- ── 4. background_job_runs — per-execution history ───────────────────────────

CREATE TABLE IF NOT EXISTS background_job_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name         text        NOT NULL,
  triggered_by     text        NOT NULL DEFAULT 'cron',  -- 'cron' | 'admin_manual'
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  status           text        NOT NULL DEFAULT 'running',
  -- 'running' | 'success' | 'failed'
  records_affected integer     NOT NULL DEFAULT 0,
  error_message    text,
  metadata         jsonb
);

CREATE INDEX IF NOT EXISTS idx_jobruns_name ON background_job_runs (job_name, started_at DESC);

ALTER TABLE background_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobruns_admin" ON background_job_runs;
CREATE POLICY "jobruns_admin"
  ON background_job_runs FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ── 5. Job functions ─────────────────────────────────────────────────────────
-- Each function holds the full job logic.
-- pg_cron calls them via:  SELECT fn_<name>();
-- The admin Health page can call them the same way for manual runs.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_expire_stale_requests()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_count  integer;
  v_run_id uuid;
BEGIN
  INSERT INTO background_job_runs (job_name, triggered_by, status)
  VALUES ('expire-stale-requests', 'cron', 'running')
  RETURNING id INTO v_run_id;

  WITH expired AS (
    UPDATE requests
    SET    status = 'expired'
    WHERE  status = 'pending'
      AND  created_at < now() - interval '48 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM expired;

  IF v_count > 0 THEN
    INSERT INTO system_events (event_type, source, severity, message, metadata)
    VALUES (
      'request_expired', 'expire-stale-requests', 'info',
      format('%s pending request(s) auto-expired after 48h', v_count),
      jsonb_build_object('count', v_count)
    );
  END IF;

  UPDATE background_job_runs
  SET status = 'success', finished_at = now(), records_affected = v_count
  WHERE id = v_run_id;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO system_events (event_type, source, severity, message, metadata)
  VALUES ('job_error', 'expire-stale-requests', 'error', SQLERRM, NULL);
  UPDATE background_job_runs
  SET status = 'failed', finished_at = now(), error_message = SQLERRM
  WHERE id = v_run_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_detect_signal_lost()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_count  integer;
  v_run_id uuid;
BEGIN
  INSERT INTO background_job_runs (job_name, triggered_by, status)
  VALUES ('detect-signal-lost', 'cron', 'running')
  RETURNING id INTO v_run_id;

  -- Flag routes that had GPS before but not in the last 10 minutes
  WITH lost AS (
    SELECT r.id
    FROM   routes r
    WHERE  r.status = 'in_transit'
      AND  r.signal_lost_at IS NULL
      AND  EXISTS     (SELECT 1 FROM driver_locations dl WHERE dl.route_id = r.id)
      AND  NOT EXISTS (SELECT 1 FROM driver_locations dl
                       WHERE  dl.route_id = r.id
                         AND  dl.recorded_at > now() - interval '10 minutes')
  ),
  flagged AS (
    UPDATE routes SET signal_lost_at = now()
    WHERE  id IN (SELECT id FROM lost)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM flagged;

  -- Recover signal for routes that now have a recent ping
  UPDATE routes SET signal_lost_at = NULL
  WHERE  status = 'in_transit'
    AND  signal_lost_at IS NOT NULL
    AND  EXISTS (SELECT 1 FROM driver_locations dl
                 WHERE  dl.route_id = routes.id
                   AND  dl.recorded_at > now() - interval '10 minutes');

  IF v_count > 0 THEN
    INSERT INTO system_events (event_type, source, severity, message, metadata)
    VALUES (
      'signal_lost', 'detect-signal-lost', 'warning',
      format('%s route(s) lost GPS signal (no ping for >10 min)', v_count),
      jsonb_build_object('count', v_count)
    );

    INSERT INTO notifications (user_id, title, message, type)
    SELECT id,
           'Sinjali GPS u humb',
           format('%s rrugë aktive nuk kanë dërguar GPS për mbi 10 minuta.', v_count),
           'warning'
    FROM   users WHERE role = 'admin';
  END IF;

  UPDATE background_job_runs
  SET status = 'success', finished_at = now(), records_affected = v_count
  WHERE id = v_run_id;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO system_events (event_type, source, severity, message, metadata)
  VALUES ('job_error', 'detect-signal-lost', 'error', SQLERRM, NULL);
  UPDATE background_job_runs
  SET status = 'failed', finished_at = now(), error_message = SQLERRM
  WHERE id = v_run_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_notify_unconfirmed_deliveries()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_count  integer;
  v_run_id uuid;
BEGIN
  INSERT INTO background_job_runs (job_name, triggered_by, status)
  VALUES ('notify-unconfirmed-deliveries', 'cron', 'running')
  RETURNING id INTO v_run_id;

  SELECT count(*) INTO v_count
  FROM   shipment_details
  WHERE  shipment_status    = 'dorëzuar'
    AND  delivery_confirmed = FALSE
    AND  delivered_at       < now() - interval '72 hours';

  IF v_count > 0 THEN
    INSERT INTO system_events (event_type, source, severity, message, metadata)
    VALUES (
      'unconfirmed_delivery', 'notify-unconfirmed-deliveries', 'warning',
      format('%s dërgesa janë shënuar si dorëzuar por ende pa u konfirmuar nga biznesi (>72h)', v_count),
      jsonb_build_object('count', v_count)
    );

    INSERT INTO notifications (user_id, title, message, type)
    SELECT id,
           'Dorëzime të pakonfirmuara',
           format('%s dërgesa kanë kaluar 72 orë pa konfirmim nga biznesi.', v_count),
           'warning'
    FROM   users WHERE role = 'admin';
  END IF;

  UPDATE background_job_runs
  SET status = 'success', finished_at = now(), records_affected = v_count
  WHERE id = v_run_id;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO system_events (event_type, source, severity, message, metadata)
  VALUES ('job_error', 'notify-unconfirmed-deliveries', 'error', SQLERRM, NULL);
  UPDATE background_job_runs
  SET status = 'failed', finished_at = now(), error_message = SQLERRM
  WHERE id = v_run_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_detect_idle_routes()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_count  integer;
  v_run_id uuid;
BEGIN
  INSERT INTO background_job_runs (job_name, triggered_by, status)
  VALUES ('detect-idle-routes', 'cron', 'running')
  RETURNING id INTO v_run_id;

  SELECT count(*) INTO v_count
  FROM   routes
  WHERE  status        = 'available'
    AND  departure_date < current_date - 1;

  IF v_count > 0 THEN
    INSERT INTO system_events (event_type, source, severity, message, metadata)
    VALUES (
      'idle_route', 'detect-idle-routes', 'warning',
      format('%s rrugë janë akoma "available" por data e nisjes ka kaluar', v_count),
      jsonb_build_object('count', v_count)
    );

    INSERT INTO notifications (user_id, title, message, type)
    SELECT id,
           'Rrugë joaktive',
           format('%s rrugë kanë datë nisje të kaluar por janë akoma "available".', v_count),
           'warning'
    FROM   users WHERE role = 'admin';
  END IF;

  UPDATE background_job_runs
  SET status = 'success', finished_at = now(), records_affected = v_count
  WHERE id = v_run_id;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO system_events (event_type, source, severity, message, metadata)
  VALUES ('job_error', 'detect-idle-routes', 'error', SQLERRM, NULL);
  UPDATE background_job_runs
  SET status = 'failed', finished_at = now(), error_message = SQLERRM
  WHERE id = v_run_id;
END;
$$;

-- ── 6. pg_cron registration ───────────────────────────────────────────────────
-- Wrapped in a DO block so the script succeeds even when pg_cron is not yet
-- enabled.  The functions above are created regardless.
--
-- To enable pg_cron:
--   Supabase Dashboard → Database → Extensions → search "pg_cron" → Enable
-- Then re-run this script (or just re-run from this block downward).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '=============================================================';
    RAISE NOTICE 'pg_cron is NOT enabled — cron jobs were NOT registered.';
    RAISE NOTICE 'Enable it: Supabase Dashboard → Database → Extensions → pg_cron';
    RAISE NOTICE 'Then re-run this script to register the 4 background jobs.';
    RAISE NOTICE '=============================================================';
    RETURN;
  END IF;

  -- Remove old versions (idempotent re-run)
  EXECUTE 'DELETE FROM cron.job WHERE jobname = ANY($1::text[])'
    USING ARRAY[
      'expire-stale-requests',
      'detect-signal-lost',
      'notify-unconfirmed-deliveries',
      'detect-idle-routes'
    ];

  -- Register jobs — command is just a simple function call, no nested quoting
  EXECUTE 'SELECT cron.schedule(''expire-stale-requests'',          ''0 */2 * * *'',   ''SELECT fn_expire_stale_requests()'')';
  EXECUTE 'SELECT cron.schedule(''detect-signal-lost'',             ''*/5 * * * *'',   ''SELECT fn_detect_signal_lost()'')';
  EXECUTE 'SELECT cron.schedule(''notify-unconfirmed-deliveries'',  ''0 9,21 * * *'',  ''SELECT fn_notify_unconfirmed_deliveries()'')';
  EXECUTE 'SELECT cron.schedule(''detect-idle-routes'',             ''0 6 * * *'',     ''SELECT fn_detect_idle_routes()'')';

  RAISE NOTICE '4 cron jobs registered successfully.';
END;
$$;

-- ── 6. Useful views for the admin health page ─────────────────────────────────

CREATE OR REPLACE VIEW v_system_health AS
SELECT
  (SELECT count(*) FROM routes   WHERE status = 'in_transit')                                              AS active_routes,
  (SELECT count(*) FROM routes   WHERE signal_lost_at IS NOT NULL AND status = 'in_transit')               AS signal_lost_routes,
  (SELECT count(*) FROM routes   WHERE status = 'available' AND departure_date < current_date - 1)         AS idle_routes,
  (SELECT count(*) FROM requests WHERE status = 'pending' AND created_at < now() - interval '48 hours')    AS expiring_requests,
  (SELECT count(*) FROM requests WHERE status = 'expired')                                                  AS expired_requests,
  (SELECT count(*) FROM shipment_details WHERE shipment_status = 'dorëzuar' AND delivery_confirmed = FALSE
                                          AND delivered_at < now() - interval '72 hours')                   AS unconfirmed_deliveries,
  (SELECT count(*) FROM background_job_runs WHERE status = 'failed' AND started_at > now() - interval '24 hours') AS failed_jobs_24h,
  now() AS snapshot_at;

-- Grant admin access to the view
GRANT SELECT ON v_system_health TO authenticated;
