-- ============================================================
-- 17/11/2026 - the "avatars" storage bucket accepted uploads from anyone, signed in or not.
-- A security test uploaded a 1-byte file without logging in, and it worked.
-- After this: only signed-in users upload, only images, up to 2 MB; everyone can still view
-- (the bucket is public, profile photos are shown on the public booking page).
-- Safe to run more than once. Nothing here deletes data.
-- The last statement prints one check row.
-- ============================================================

-- 1. limits on the bucket itself
UPDATE storage.buckets
   SET file_size_limit = 2097152,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 WHERE id = 'avatars';

-- 2. drop every existing policy that touches the avatars bucket (they were made by hand in the dashboard)
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND (coalesce(qual, '') ILIKE '%avatars%' OR coalesce(with_check, '') ILIKE '%avatars%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- 3. fresh rules: view for all; upload for signed-in users; change or remove only your own files
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars signed-in upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND owner_id = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND owner_id = auth.uid()::text);

CREATE POLICY "avatars owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND owner_id = auth.uid()::text);

-- 4. check: expect 4 policies, no policy for anon / public writes, limit 2097152
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'avatars %') AS avatars_policies,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (coalesce(qual, '') ILIKE '%avatars%' OR coalesce(with_check, '') ILIKE '%avatars%')
     AND cmd <> 'SELECT' AND NOT ('authenticated' = ANY (roles))) AS open_write_policies,
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'avatars') AS size_limit;
