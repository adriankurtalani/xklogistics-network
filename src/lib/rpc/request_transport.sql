-- =============================================================================
-- RPC: request_transport
-- =============================================================================
-- Atomically validates and inserts a transport request from a business.
--
-- Checks performed inside a single serialisable transaction with a row-level
-- FOR UPDATE lock on the routes row, so two concurrent requests for the same
-- route are serialised and the second one sees the updated state left by the
-- first.
--
-- Parameters
--   p_route_id    uuid  – the route the business wants to book
--   p_business_id uuid  – the authenticated business user's id
--
-- Return value  jsonb
--   { "success": true,  "request_id": "<uuid>", "remaining_capacity": <number> }
--   { "success": false, "error_code": "<code>", ...extra context fields }
--
-- Error codes
--   route_not_found       – no row with that id in routes
--   route_not_available   – route.status != 'available'
--   duplicate_request     – this business already has a pending/accepted request
--   no_capacity           – available_capacity minus accepted weights <= 0
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- =============================================================================

CREATE OR REPLACE FUNCTION request_transport(
  p_route_id    uuid,
  p_business_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER          -- runs with the privileges of the function owner
                          -- (bypasses RLS so we can read all rows for the check)
SET search_path = public
AS $$
DECLARE
  v_route             routes%ROWTYPE;
  v_accepted_weight   numeric;
  v_remaining         numeric;
  v_new_request_id    uuid;
BEGIN

  -- ── 1. Lock the route row for the duration of this transaction ─────────────
  --  FOR UPDATE ensures that two concurrent calls for the same route are
  --  serialised: the second call waits until the first commits or rolls back,
  --  then reads the freshly committed state.
  SELECT *
    INTO v_route
    FROM routes
   WHERE id = p_route_id
     FOR UPDATE;

  -- ── 2. Route must exist ────────────────────────────────────────────────────
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'route_not_found'
    );
  END IF;

  -- ── 3. Route must still be available ──────────────────────────────────────
  IF v_route.status <> 'available' THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'route_not_available',
      'route_status', v_route.status
    );
  END IF;

  -- ── 4. No duplicate active request from this business ─────────────────────
  --  We block both 'pending' (not yet decided) and 'accepted' (already booked)
  --  to prevent double-booking from the same client.
  IF EXISTS (
    SELECT 1
      FROM requests
     WHERE route_id   = p_route_id
       AND business_id = p_business_id
       AND status IN ('pending', 'accepted')
  ) THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'duplicate_request'
    );
  END IF;

  -- ── 5. Capacity check ─────────────────────────────────────────────────────
  --  Sum the weight_kg of every shipment_details row that belongs to an
  --  *accepted* request on this route.  Weights are only known after a business
  --  fills the shipment form, so COALESCE handles NULLs.
  --  If no accepted requests exist yet the sum is 0 and capacity = full.
  SELECT COALESCE(SUM(sd.weight_kg), 0)
    INTO v_accepted_weight
    FROM requests        r
    JOIN shipment_details sd ON sd.request_id = r.id
   WHERE r.route_id = p_route_id
     AND r.status   = 'accepted';

  v_remaining := v_route.available_capacity - v_accepted_weight;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success',          false,
      'error_code',       'no_capacity',
      'total_capacity',   v_route.available_capacity,
      'used_capacity',    v_accepted_weight
    );
  END IF;

  -- ── 6. All checks passed — insert the request atomically ──────────────────
  INSERT INTO requests (route_id, business_id, status)
  VALUES (p_route_id, p_business_id, 'pending')
  RETURNING id INTO v_new_request_id;

  RETURN jsonb_build_object(
    'success',            true,
    'request_id',         v_new_request_id,
    'remaining_capacity', v_remaining
  );

END;
$$;

-- Grant execution to the anon and authenticated roles so the Supabase
-- client can call it from the browser with the anon key.
GRANT EXECUTE ON FUNCTION request_transport(uuid, uuid) TO anon, authenticated;
