-- Counters for the launch (21/11/2026): page views of /welcome and /assistant, and one function that gives the admin
-- the funnel numbers. No cookies, no addresses, no personal data: a view is just (time, which page, the ?src= tag).
-- Run AFTER 20261119000000_business_assistant.sql. Safe to run twice. Deletes nothing. No Hebrew text in this file.

CREATE TABLE IF NOT EXISTS public.page_views (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  page        TEXT NOT NULL CHECK (page IN ('welcome', 'assistant')),
  src         TEXT NOT NULL DEFAULT '' CHECK (char_length(src) <= 20)
);
CREATE INDEX IF NOT EXISTS page_views_created_idx ON public.page_views (created_at DESC);

-- written only by the Netlify function page-view (service key): nobody else can read or write it
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.page_views FROM anon, authenticated;

-- the funnel for the last p_days days, one row per number
DROP FUNCTION IF EXISTS public.admin_assistant_stats(INTEGER);
CREATE OR REPLACE FUNCTION public.admin_assistant_stats(p_days INTEGER DEFAULT 7)
RETURNS TABLE (metric TEXT, value BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  since TIMESTAMPTZ := now() - make_interval(days => LEAST(GREATEST(p_days, 1), 365));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY
    SELECT 'welcome_views'::TEXT,    (SELECT count(*) FROM public.page_views WHERE page = 'welcome'   AND created_at >= since)
    UNION ALL SELECT 'assistant_views',        (SELECT count(*) FROM public.page_views WHERE page = 'assistant' AND created_at >= since)
    UNION ALL SELECT 'chats_guest',            (SELECT count(*) FROM public.assistant_conversations WHERE user_id IS NULL     AND jsonb_array_length(messages) > 0 AND created_at >= since)
    UNION ALL SELECT 'chats_registered',       (SELECT count(*) FROM public.assistant_conversations WHERE user_id IS NOT NULL AND jsonb_array_length(messages) > 0 AND created_at >= since)
    UNION ALL SELECT 'plans_made',             (SELECT count(*) FROM public.assistant_conversations WHERE status = 'done' AND created_at >= since)
    UNION ALL SELECT 'off_topic_messages',     (SELECT COALESCE(sum(off_topic_count), 0) FROM public.assistant_conversations WHERE created_at >= since)
    UNION ALL SELECT 'plans_saved',            (SELECT count(*) FROM public.business_plans WHERE created_at >= since)
    UNION ALL SELECT 'signups',                (SELECT count(*) FROM public.profiles WHERE created_at >= since)
    UNION ALL SELECT 'leads',                  (SELECT count(*) FROM public.leads WHERE created_at >= since);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_assistant_stats(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assistant_stats(INTEGER) TO authenticated;

-- check: page_views is closed to everyone, and the stats function exists
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.page_views'::regclass) AS views_rls_on,
  has_table_privilege('anon', 'public.page_views', 'SELECT') AS anon_can_read_views,
  has_table_privilege('authenticated', 'public.page_views', 'SELECT') AS user_can_read_views,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_assistant_stats') AS stats_function_exists;
