-- =============================================================================
-- Verified Carrier — database schema
-- =============================================================================
-- Run this once in Supabase Dashboard → SQL Editor → New query.
-- =============================================================================

-- 1. Add is_verified flag to the users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Verification documents table
--    Each transporter may upload one document per doc_type.
--    On re-upload after rejection the existing row is updated (upsert).
CREATE TABLE IF NOT EXISTS verification_documents (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transporter_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type         text        NOT NULL
                               CHECK (doc_type IN ('license', 'company_registration', 'insurance')),
  file_path        text        NOT NULL,
  file_name        text        NOT NULL,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by      uuid        REFERENCES users(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- One active submission per transporter per document type
  UNIQUE (transporter_id, doc_type)
);

-- 3. Index for the admin review queue (pending docs)
CREATE INDEX IF NOT EXISTS idx_vdoc_status
  ON verification_documents (status, created_at DESC);

-- 4. Index for per-transporter lookups (profile page)
CREATE INDEX IF NOT EXISTS idx_vdoc_transporter
  ON verification_documents (transporter_id);

-- 5. RLS — enable but allow SECURITY DEFINER functions to bypass
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;

-- Transporters can read and upsert their own documents
DROP POLICY IF EXISTS "transporters_own_docs" ON verification_documents;
CREATE POLICY "transporters_own_docs"
  ON verification_documents
  FOR ALL
  TO authenticated
  USING  (transporter_id = auth.uid())
  WITH CHECK (transporter_id = auth.uid());

-- Admins can read and update every document (admin verification page queries directly)
DROP POLICY IF EXISTS "admins_all_docs" ON verification_documents;
CREATE POLICY "admins_all_docs"
  ON verification_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- 6. Supabase Storage bucket
--    Create manually in Supabase Dashboard → Storage → New bucket:
--      Name  : verification-documents
--      Public: false  (signed URLs for download)
--    Then add the following Storage policies in the bucket's Policies tab:
--
--    UPLOAD  (INSERT) : (auth.uid() = owner)  → transporters upload their own docs
--    READ    (SELECT) : (auth.uid() = owner)  → transporter reads their own files
--    ADMIN READ       : role = 'admin'         → admins read all (add via custom policy)
--
--    If you prefer a simpler setup during development, set the bucket to
--    "Authenticated users only" in the dashboard.
