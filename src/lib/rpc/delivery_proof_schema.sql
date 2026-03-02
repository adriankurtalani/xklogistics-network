-- =============================================================================
-- Delivery Proof Flow — database schema
-- =============================================================================
-- Run this once in Supabase Dashboard → SQL Editor → New query.
-- =============================================================================

-- Add delivery confirmation fields to shipment_details
ALTER TABLE shipment_details
  ADD COLUMN IF NOT EXISTS delivery_confirmed    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ;

-- Index for looking up unconfirmed delivered shipments (business dashboard query)
CREATE INDEX IF NOT EXISTS idx_shipment_unconfirmed
  ON shipment_details (shipment_status, delivery_confirmed)
  WHERE shipment_status = 'dorëzuar' AND delivery_confirmed = FALSE;
