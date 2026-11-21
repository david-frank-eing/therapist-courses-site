-- History of the owner's instructions to the business assistant (21/11/2026).
-- Every time the instructions are saved (table assistant_config) a copy is kept, so there is a record of how the
-- assistant was "trained", and an older version can be loaded back into the editor. Only an admin can read it, and
-- only the trigger below writes to it. The last 100 versions are kept. No personal data: it is the owner's own text.
-- Run AFTER 20261119000000_business_assistant.sql. Safe to run twice. Deletes nothing you wrote. No Hebrew in this file.

CREATE TABLE IF NOT EXISTS public.assistant_config_history (
  id             BIGSERIAL PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  guidelines     TEXT NOT NULL DEFAULT '',
  question_bank  TEXT NOT NULL DEFAULT '',
  examples       TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.assistant_config_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_config_history FROM anon;

DROP POLICY IF EXISTS "Admins read assistant config history" ON public.assistant_config_history;
CREATE POLICY "Admins read assistant config history" ON public.assistant_config_history
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- no INSERT / UPDATE / DELETE policy: nobody can edit the history from the browser

CREATE OR REPLACE FUNCTION public.assistant_config_log() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.guidelines IS NOT DISTINCT FROM OLD.guidelines
       AND NEW.question_bank IS NOT DISTINCT FROM OLD.question_bank
       AND NEW.examples IS NOT DISTINCT FROM OLD.examples THEN
      RETURN NEW;   -- nothing the owner wrote has changed
    END IF;
  END IF;
  INSERT INTO public.assistant_config_history (guidelines, question_bank, examples)
  VALUES (NEW.guidelines, NEW.question_bank, NEW.examples);
  DELETE FROM public.assistant_config_history
   WHERE id NOT IN (SELECT id FROM public.assistant_config_history ORDER BY id DESC LIMIT 100);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assistant_config_log_trg ON public.assistant_config;
CREATE TRIGGER assistant_config_log_trg
  AFTER INSERT OR UPDATE ON public.assistant_config
  FOR EACH ROW EXECUTE FUNCTION public.assistant_config_log();

-- the first entry: what is written there today
INSERT INTO public.assistant_config_history (guidelines, question_bank, examples)
SELECT guidelines, question_bank, examples FROM public.assistant_config
WHERE id = 1 AND NOT EXISTS (SELECT 1 FROM public.assistant_config_history);

-- check: rls_on true, anon false, versions >= 1
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assistant_config_history'::regclass) AS history_rls_on,
  has_table_privilege('anon', 'public.assistant_config_history', 'SELECT') AS anon_can_read_history,
  (SELECT count(*) FROM public.assistant_config_history) AS versions;
