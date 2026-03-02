-- =============================================================================
-- Storage RLS policies for the "platform-assets" bucket
-- Run once in: Supabase Dashboard → SQL Editor → New query
-- =============================================================================

-- ── Allow public READ (anyone can fetch the favicon URL) ─────────────────────
DROP POLICY IF EXISTS "platform_assets_public_read" ON storage.objects;
CREATE POLICY "platform_assets_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'platform-assets');

-- ── Allow admins to INSERT (upload new favicon) ───────────────────────────────
DROP POLICY IF EXISTS "platform_assets_admin_insert" ON storage.objects;
CREATE POLICY "platform_assets_admin_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'platform-assets'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Allow admins to UPDATE (overwrite / upsert) ───────────────────────────────
DROP POLICY IF EXISTS "platform_assets_admin_update" ON storage.objects;
CREATE POLICY "platform_assets_admin_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'platform-assets'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── Allow admins to DELETE ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "platform_assets_admin_delete" ON storage.objects;
CREATE POLICY "platform_assets_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'platform-assets'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
