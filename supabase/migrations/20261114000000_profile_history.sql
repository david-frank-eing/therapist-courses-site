-- היסטוריית שינויים למשתמש: מתי נרשם, מתי שודרגה/הורדה הדרגה, מתי הופעל מתג הכספים, מתי שונה תוקף המנוי.
-- בטוח להרצה חוזרת. נקרא רק על ידי מנהל.

CREATE TABLE IF NOT EXISTS public.profile_history (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by  UUID,                 -- מי עשה את השינוי (ריק = המערכת / שרת)
  field       TEXT NOT NULL,        -- subscription_tier | finance_enabled | subscription_expires_at | signup
  old_value   TEXT,
  new_value   TEXT
);
CREATE INDEX IF NOT EXISTS profile_history_user_idx ON public.profile_history (user_id, changed_at DESC);

ALTER TABLE public.profile_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read profile history" ON public.profile_history;
CREATE POLICY "Admins read profile history" ON public.profile_history
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- אין מדיניות כתיבה: רק הטריגר (SECURITY DEFINER) כותב.

CREATE OR REPLACE FUNCTION public.log_profile_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o jsonb; n jsonb; f text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.profile_history (user_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'signup', NULL, NEW.subscription_tier::text);
    RETURN NEW;
  END IF;
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  FOREACH f IN ARRAY ARRAY['subscription_tier','finance_enabled','subscription_expires_at'] LOOP
    IF (o->>f) IS DISTINCT FROM (n->>f) THEN
      INSERT INTO public.profile_history (user_id, changed_by, field, old_value, new_value)
      VALUES (NEW.id, auth.uid(), f, o->>f, n->>f);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profile_history_trg ON public.profiles;
CREATE TRIGGER profile_history_trg AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_profile_change();

-- בדיקה: צריך להחזיר history_table = true, trigger = true
SELECT to_regclass('public.profile_history') IS NOT NULL AS history_table,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profile_history_trg') AS trigger;
