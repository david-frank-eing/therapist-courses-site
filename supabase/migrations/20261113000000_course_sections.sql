-- ============================================================
-- Course chapters + course cover images (13/11/2026)
-- Safe to run more than once. Does not change or delete existing data.
-- ============================================================

-- 1. Chapters of a course
CREATE TABLE IF NOT EXISTS public.course_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.course_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view chapters of published courses" ON public.course_sections;
CREATE POLICY "Anyone can view chapters of published courses"
  ON public.course_sections FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.is_published = true));

DROP POLICY IF EXISTS "Admins can manage chapters" ON public.course_sections;
CREATE POLICY "Admins can manage chapters"
  ON public.course_sections FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Every lesson can belong to a chapter. Deleting a chapter keeps its lessons (they become "no chapter").
ALTER TABLE public.course_resources
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.course_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS course_resources_section_idx ON public.course_resources (section_id);
CREATE INDEX IF NOT EXISTS course_sections_course_idx ON public.course_sections (course_id, order_index);

-- 3. Cover images: a public bucket (a cover is shown in the catalog to everyone); only admins can write.
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-covers', 'course-covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins manage course covers" ON storage.objects;
CREATE POLICY "Admins manage course covers"
  ON storage.objects FOR ALL
  USING (bucket_id = 'course-covers' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'course-covers' AND public.has_role(auth.uid(), 'admin'));

-- 4. Check: should return one row with chapters_table = true, section_column = true, covers_bucket = true
SELECT
  to_regclass('public.course_sections') IS NOT NULL AS chapters_table,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'course_resources' AND column_name = 'section_id') AS section_column,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'course-covers' AND public = true) AS covers_bucket;
