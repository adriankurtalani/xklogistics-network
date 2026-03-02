-- ─────────────────────────────────────────────────────────────────────────────
-- RLS policies for the shipment_documents table
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- These policies are the root cause of:
--   • Bug: Deleted documents reappearing after F5 refresh
--     (Supabase silently returns count=0 on a blocked DELETE — no JS error)
-- ─────────────────────────────────────────────────────────────────────────────

-- Make sure RLS is enabled (idempotent)
ALTER TABLE shipment_documents ENABLE ROW LEVEL SECURITY;

-- ── SELECT ───────────────────────────────────────────────────────────────────
-- Transporters see docs for their own shipments; businesses see docs for
-- their own shipments; admins see everything.
CREATE POLICY IF NOT EXISTS "shipment_docs_select"
  ON shipment_documents
  FOR SELECT
  TO authenticated
  USING (
    -- The uploader can always read their own docs
    uploader_id = auth.uid()
    OR
    -- Any authenticated user involved with this shipment can read it
    -- (transporter or business — resolved via the request/route chain)
    EXISTS (
      SELECT 1
      FROM shipment_details sd
      JOIN requests r   ON r.id  = sd.request_id
      JOIN routes   ro  ON ro.id = r.route_id
      WHERE sd.id = shipment_documents.shipment_id
        AND (ro.transporter_id = auth.uid() OR r.business_id = auth.uid())
    )
    OR
    -- Admins
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── INSERT ────────────────────────────────────────────────────────────────────
-- Only the uploader themselves can insert and they must set uploader_id = themselves.
CREATE POLICY IF NOT EXISTS "shipment_docs_insert"
  ON shipment_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (uploader_id = auth.uid());

-- ── DELETE ────────────────────────────────────────────────────────────────────
-- The uploader can delete their own document, BUT only while the shipment is
-- NOT locked (is_locked = false).  Admins can always delete.
CREATE POLICY IF NOT EXISTS "shipment_docs_delete"
  ON shipment_documents
  FOR DELETE
  TO authenticated
  USING (
    -- Original uploader, and shipment is not yet locked
    (
      uploader_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM shipment_details
        WHERE id = shipment_documents.shipment_id
          AND is_locked = TRUE
      )
    )
    OR
    -- Admin override
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────
-- Documents are immutable once inserted; no UPDATE policy needed.
-- (Metadata changes would require a delete + re-insert.)
