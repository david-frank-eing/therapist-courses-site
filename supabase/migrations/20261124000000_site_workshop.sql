-- Texts the owner edits in the Admin screen, so no code change and no Supabase visit is needed after this one-time setup (24/11/2026):
--   1. site_workshop: the upcoming workshop, the "about me" block, and the texts of the floating button and its pop-up (one row, id = 1)
--   2. site_seo: the title and description shown in Google and in link previews (WhatsApp, Facebook) for 3 pages
-- Everyone can READ them (public marketing text); only an admin can write. The registration link must be a plain
-- https:// address (nothing like javascript:), and every field has a length limit.
-- Every save of the workshop also keeps a copy in site_workshop_history (admin-only, last 50).
-- Safe to run twice (also on top of an earlier version of this file). Deletes nothing. No Hebrew text in this file on
-- purpose: the Admin screens offer the default texts.

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

-- the "about me" block and the pop-up texts (an empty value means "use the default text")
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS about_title        TEXT NOT NULL DEFAULT '' CHECK (char_length(about_title) <= 40);
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS about_text         TEXT NOT NULL DEFAULT '' CHECK (char_length(about_text) <= 800);
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS about_quote        TEXT NOT NULL DEFAULT '' CHECK (char_length(about_quote) <= 300);
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS about_button       TEXT NOT NULL DEFAULT '' CHECK (char_length(about_button) <= 40);
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS popup_button       TEXT NOT NULL DEFAULT '' CHECK (char_length(popup_button) <= 60);
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS popup_form_title   TEXT NOT NULL DEFAULT '' CHECK (char_length(popup_form_title) <= 80);
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS popup_submit       TEXT NOT NULL DEFAULT '' CHECK (char_length(popup_submit) <= 40);
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS popup_thanks_title TEXT NOT NULL DEFAULT '' CHECK (char_length(popup_thanks_title) <= 80);
ALTER TABLE public.site_workshop ADD COLUMN IF NOT EXISTS popup_thanks_text  TEXT NOT NULL DEFAULT '' CHECK (char_length(popup_thanks_text) <= 300);

INSERT INTO public.site_workshop (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_workshop ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read the workshop" ON public.site_workshop;
CREATE POLICY "Anyone can read the workshop" ON public.site_workshop FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins write the workshop" ON public.site_workshop;
CREATE POLICY "Admins write the workshop" ON public.site_workshop
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- history of the workshop texts ------------------------------------------------------------------------------------
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

-- Google and link previews --------------------------------------------------------------------------------------
-- Read by a Netlify edge function on every page request, which writes these into the page's <title> and meta tags.
-- An empty field means "leave the page as it is".
CREATE TABLE IF NOT EXISTS public.site_seo (
  page            TEXT PRIMARY KEY CHECK (page IN ('default', 'welcome', 'assistant')),
  title           TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  description     TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  og_title        TEXT NOT NULL DEFAULT '' CHECK (char_length(og_title) <= 120),
  og_description  TEXT NOT NULL DEFAULT '' CHECK (char_length(og_description) <= 300),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.site_seo (page) VALUES ('default'), ('welcome'), ('assistant') ON CONFLICT (page) DO NOTHING;

ALTER TABLE public.site_seo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read seo texts" ON public.site_seo;
CREATE POLICY "Anyone can read seo texts" ON public.site_seo FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins write seo texts" ON public.site_seo;
CREATE POLICY "Admins write seo texts" ON public.site_seo
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- history of the Google / link-preview texts (admin-only, written only by the trigger, last 200 kept) --------------
CREATE TABLE IF NOT EXISTS public.site_seo_history (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  page        TEXT NOT NULL,
  snapshot    JSONB NOT NULL
);
ALTER TABLE public.site_seo_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_seo_history FROM anon;

DROP POLICY IF EXISTS "Admins read seo history" ON public.site_seo_history;
CREATE POLICY "Admins read seo history" ON public.site_seo_history
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- no write policy: only the trigger below writes

CREATE OR REPLACE FUNCTION public.site_seo_log() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- the empty rows made by this file are not history
  IF NEW.title = '' AND NEW.description = '' AND NEW.og_title = '' AND NEW.og_description = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS NOT DISTINCT FROM OLD.title
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.og_title IS NOT DISTINCT FROM OLD.og_title
       AND NEW.og_description IS NOT DISTINCT FROM OLD.og_description THEN
      RETURN NEW;   -- nothing the owner wrote has changed
    END IF;
  END IF;
  INSERT INTO public.site_seo_history (page, snapshot) VALUES (NEW.page, to_jsonb(NEW));
  DELETE FROM public.site_seo_history
   WHERE id NOT IN (SELECT id FROM public.site_seo_history ORDER BY id DESC LIMIT 200);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_seo_log_trg ON public.site_seo;
CREATE TRIGGER site_seo_log_trg
  AFTER INSERT OR UPDATE ON public.site_seo
  FOR EACH ROW EXECUTE FUNCTION public.site_seo_log();

-- check: rls_on true everywhere, anon reads the two public tables, anon cannot read any history, 1 workshop row, 3 seo rows
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_workshop'::regclass) AS workshop_rls_on,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_seo'::regclass)      AS seo_rls_on,
  has_table_privilege('anon', 'public.site_workshop', 'SELECT') AS anon_can_read_workshop,
  (has_table_privilege('anon', 'public.site_workshop_history', 'SELECT')
   OR has_table_privilege('anon', 'public.site_seo_history', 'SELECT')) AS anon_can_read_any_history,
  (SELECT count(*) FROM public.site_workshop) AS workshop_rows,
  (SELECT count(*) FROM public.site_seo) AS seo_rows;
