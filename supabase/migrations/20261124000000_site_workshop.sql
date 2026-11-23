-- The upcoming workshop shown on the home page and in the pop-up (24/11/2026).
-- One row (id = 1) that the owner edits in the Admin screen (the "workshop" tab) before every new workshop, so no code change is needed.
-- Everyone can READ it (it is public marketing text); only an admin can write it. The registration link must be a
-- plain https:// address (nothing like javascript:), and every field has a length limit.
-- Every save also keeps a copy in site_workshop_history (admin-only, last 50), so there is a record of past workshops.
-- Safe to run twice. Deletes nothing. No Hebrew text in this file on purpose (the editor screen offers default texts).

CREATE TABLE IF NOT EXISTS public.site_workshop (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  enabled        BOOLEAN NOT NULL DEFAULT false,
  badge          TEXT NOT NULL DEFAULT '' CHECK (char_length(badge) <= 40),
  title          TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  kind           TEXT NOT NULL DEFAULT '' CHECK (char_length(kind) <= 60),
  date_text      TEXT NOT NULL DEFAULT '' CHECK (char_length(date_text) <= 60),
  duration_text  TEXT NOT NULL DEFAULT '' CHECK (char_length(duration_text) <= 60),
  price_text     TEXT NOT NULL DEFAULT '' CHECK (char_length(price_text) <= 80),
  location_text  TEXT NOT NULL DEFAULT '' CHECK (char_length(location_text) <= 120),
  description    TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 800),
  button_text    TEXT NOT NULL DEFAULT '' CHECK (char_length(button_text) <= 40),
  register_url   TEXT NOT NULL DEFAULT '' CHECK (char_length(register_url) <= 500 AND (register_url = '' OR register_url ~ '^https://[^[:space:]]+$')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.site_workshop (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_workshop ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read the workshop" ON public.site_workshop;
CREATE POLICY "Anyone can read the workshop" ON public.site_workshop FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins write the workshop" ON public.site_workshop;
CREATE POLICY "Admins write the workshop" ON public.site_workshop
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- history -------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_workshop_history (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot    JSONB NOT NULL
);
ALTER TABLE public.site_workshop_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_workshop_history FROM anon;

DROP POLICY IF EXISTS "Admins read workshop history" ON public.site_workshop_history;
CREATE POLICY "Admins read workshop history" ON public.site_workshop_history
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- no write policy: only the trigger below writes

CREATE OR REPLACE FUNCTION public.site_workshop_log() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.site_workshop_history (snapshot) VALUES (to_jsonb(NEW));
  DELETE FROM public.site_workshop_history
   WHERE id NOT IN (SELECT id FROM public.site_workshop_history ORDER BY id DESC LIMIT 50);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_workshop_log_trg ON public.site_workshop;
CREATE TRIGGER site_workshop_log_trg
  AFTER UPDATE ON public.site_workshop
  FOR EACH ROW EXECUTE FUNCTION public.site_workshop_log();

-- check: rls_on true, anon can read the workshop (public text), anon cannot read the history, row exists
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_workshop'::regclass) AS workshop_rls_on,
  has_table_privilege('anon', 'public.site_workshop', 'SELECT') AS anon_can_read_workshop,
  has_table_privilege('anon', 'public.site_workshop_history', 'SELECT') AS anon_can_read_history,
  (SELECT count(*) FROM public.site_workshop) AS rows_in_workshop;
