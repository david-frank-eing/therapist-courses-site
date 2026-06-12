-- ============================================================
-- Course resources (files) + access-level management
-- ============================================================

-- 1. Resource type enum
CREATE TYPE public.resource_type AS ENUM ('document', 'presentation', 'pdf', 'other');

-- 2. Course resources table (files stored in the 'course-files' storage bucket)
CREATE TABLE public.course_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type resource_type NOT NULL DEFAULT 'document',
  file_path TEXT,
  file_name TEXT,
  url TEXT,
  min_tier subscription_tier NOT NULL DEFAULT 'free',
  order_index INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.course_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published resource metadata"
  ON public.course_resources FOR SELECT
  USING (is_published = true);

CREATE POLICY "Admins can manage resources"
  ON public.course_resources FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_course_resources_updated_at
  BEFORE UPDATE ON public.course_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Allow admins to view & update ALL profiles (for user tier management)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Private storage bucket for course files
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-files', 'course-files', false)
ON CONFLICT (id) DO NOTHING;

-- Admins can upload / update / delete files in the bucket
CREATE POLICY "Admins manage course files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'course-files' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'course-files' AND public.has_role(auth.uid(), 'admin'));

-- Any authenticated user can read files (tier gating is enforced in the app
-- by only generating a signed URL when the user's tier qualifies)
CREATE POLICY "Authenticated users can read course files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-files' AND auth.uid() IS NOT NULL);
