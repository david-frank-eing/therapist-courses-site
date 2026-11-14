-- התקדמות בקורסים (15/11/2026): איזה שיעור כל מטפל כבר פתח, כדי להציג וי ליד שיעורים שנצפו, פס התקדמות,
-- "להמשיך מאיפה שעצרת" ואת הדף "הקורסים שלי".
-- כל משתמש רואה וכותב רק את השורות של עצמו. בלי הטבלה האתר עובד כמו קודם, רק בלי סימוני התקדמות.
-- בטוח להרצה חוזרת. לא מוחק נתונים.

CREATE TABLE IF NOT EXISTS public.lesson_progress (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id  UUID NOT NULL REFERENCES public.course_resources(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, resource_id)
);

CREATE INDEX IF NOT EXISTS lesson_progress_user_course ON public.lesson_progress (user_id, course_id, viewed_at DESC);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own progress: read" ON public.lesson_progress;
CREATE POLICY "Own progress: read" ON public.lesson_progress
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own progress: add" ON public.lesson_progress;
CREATE POLICY "Own progress: add" ON public.lesson_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own progress: update" ON public.lesson_progress;
CREATE POLICY "Own progress: update" ON public.lesson_progress
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own progress: remove" ON public.lesson_progress;
CREATE POLICY "Own progress: remove" ON public.lesson_progress
  FOR DELETE USING (auth.uid() = user_id);

-- בדיקה: progress_table = true, policies = 4
SELECT to_regclass('public.lesson_progress') IS NOT NULL AS progress_table,
       (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_progress') AS policies;
