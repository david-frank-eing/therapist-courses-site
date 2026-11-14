-- טבלת הרשאות לפי דרגה (14/11/2026).
-- עד עכשיו "מי מקבל את כלי העבודה" (מטופלים, תזכורות ומשימות, זימון תורים) היה קבוע בקוד: premium ו-vip.
-- מעכשיו זה שורה בטבלה, ודוד משנה אותה ממסך הניהול (לשונית "דרגות").
-- הפונקציה has_paid_tier, שכל כללי הכתיבה במסד כבר משתמשים בה, קוראת מהטבלה. לכן זה נאכף במסד ולא רק בממשק.
--
-- בטיחות: מנהל תמיד מורשה, אז אי אפשר לנעול את עצמך בחוץ. אם אין שורה לדרגה, ברירת המחדל כמו קודם
-- (premium/vip). הורדת הרשאה לא מוחקת נתונים: קריאה ומחיקה של הנתונים שלך נשארות תמיד.
-- בטוח להרצה חוזרת.

CREATE TABLE IF NOT EXISTS public.tier_access (
  feature     TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('free', 'basic', 'premium', 'vip')),
  allowed     BOOLEAN NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID,
  PRIMARY KEY (feature, tier)
);

ALTER TABLE public.tier_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users read tier access" ON public.tier_access;
CREATE POLICY "Signed-in users read tier access" ON public.tier_access
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage tier access" ON public.tier_access;
CREATE POLICY "Admins manage tier access" ON public.tier_access
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- המצב הנוכחי, כדי שכלום לא ישתנה עד שדוד משנה
INSERT INTO public.tier_access (feature, tier, allowed) VALUES
  ('paid_tools', 'free',    false),
  ('paid_tools', 'basic',   false),
  ('paid_tools', 'premium', true),
  ('paid_tools', 'vip',     true)
ON CONFLICT (feature, tier) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_tier_access_meta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tier_access_meta ON public.tier_access;
CREATE TRIGGER tier_access_meta BEFORE INSERT OR UPDATE ON public.tier_access
  FOR EACH ROW EXECUTE FUNCTION public.set_tier_access_meta();

CREATE OR REPLACE FUNCTION public.has_paid_tier(_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid
      AND (
        p.is_admin = true
        OR COALESCE(
             (SELECT a.allowed FROM public.tier_access a
               WHERE a.feature = 'paid_tools' AND a.tier = p.subscription_tier::text),
             p.subscription_tier::text IN ('premium', 'vip')
           )
      )
  )
$$;

-- בדיקה: צריך להחזיר טבלה = true, 4 שורות, ושמנהל עובר את הבדיקה
SELECT to_regclass('public.tier_access') IS NOT NULL AS tier_table,
       (SELECT count(*) FROM public.tier_access WHERE feature = 'paid_tools') AS rows_count,
       (SELECT bool_and(public.has_paid_tier(id)) FROM public.profiles WHERE is_admin = true) AS admins_pass;
