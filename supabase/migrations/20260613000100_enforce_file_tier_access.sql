-- ============================================================
-- SECURITY FIX (ISSUE-002): enforce subscription-tier gating on
-- course file downloads at the database layer.
--
-- Previously "Authenticated users can read course files" let ANY
-- logged-in user read ANY object in the course-files bucket, so a
-- free user could read a VIP resource's file_path from
-- course_resources and mint a signed URL. Tier gating lived only in
-- the React UI (CoursePage.tsx) and was trivially bypassable.
--
-- This replaces that policy with one that checks the caller's tier
-- against the resource's min_tier. Admins keep full access via the
-- existing "Admins manage course files" policy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_course_file(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.course_resources cr
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE cr.file_path = _path
        AND cr.is_published = true
        AND array_position(
              ARRAY['free','basic','premium','vip']::text[],
              p.subscription_tier::text
            ) >= array_position(
              ARRAY['free','basic','premium','vip']::text[],
              cr.min_tier::text
            )
    )
$$;

-- Replace the permissive "any authenticated user" read policy
DROP POLICY IF EXISTS "Authenticated users can read course files" ON storage.objects;

CREATE POLICY "Tiered access to course files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'course-files'
    AND public.can_access_course_file(name)
  );
