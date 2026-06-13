-- ============================================================
-- Add 'video' to the resource_type enum so course content
-- (videos + documents) can all live in course_resources. Videos
-- are stored as a URL (YouTube/Vimeo) or an uploaded file and play
-- inline on the course page; the separate `videos` table/UI is
-- retired in favor of this unified model.
-- ============================================================

ALTER TYPE public.resource_type ADD VALUE IF NOT EXISTS 'video';
