-- מה יש בכל דרגה: הטקסטים של דף המחירים (15/11/2026).
-- עד עכשיו השם, המחיר, התיאור וההטבות של כל דרגה היו כתובים בקוד. מעכשיו הם שורה בטבלה,
-- ודוד עורך אותם ממסך הניהול (לשונית "דרגות"). דף המחירים ודף הבית נבנים מהטבלה.
--
-- הטבלה נזרעת עם הטקסטים שמופיעים היום, כך שההרצה עצמה לא משנה כלום באתר.
-- כולם קוראים (דף המחירים ציבורי), רק מנהל כותב. בטוח להרצה חוזרת. לא מוחק נתונים.

CREATE TABLE IF NOT EXISTS public.tier_plans (
  tier         TEXT PRIMARY KEY CHECK (tier IN ('free', 'basic', 'premium', 'vip')),
  name         TEXT NOT NULL,
  price        INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  tagline      TEXT NOT NULL DEFAULT '',
  -- רשימת הטבות בטקסט חופשי (לא נאכף)
  perks        JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlighted  BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tier_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads tier plans" ON public.tier_plans;
CREATE POLICY "Anyone reads tier plans" ON public.tier_plans
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage tier plans" ON public.tier_plans;
CREATE POLICY "Admins manage tier plans" ON public.tier_plans
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.tier_plans (tier, name, price, tagline, perks, highlighted) VALUES
  ('free', U&'\05D7\05D9\05E0\05DD', 0, U&'\05D4\05EA\05D7\05DC\05D4 \05DE\05D5\05E9\05DC\05DE\05EA',
   jsonb_build_array(U&'\05D2\05D9\05E9\05D4 \05DC\05E7\05D5\05E8\05E1\05D9\05DD \05D1\05E1\05D9\05E1\05D9\05D9\05DD', U&'\05EA\05D5\05DB\05DF AI \05DC\05DE\05EA\05D7\05D9\05DC\05D9\05DD', U&'\05E9\05D0\05DC\05D5\05EA \05D5\05EA\05E9\05D5\05D1\05D5\05EA \05D1\05E7\05D4\05D9\05DC\05D4'), false),
  ('basic', U&'\05D1\05E1\05D9\05E1\05D9', 49, U&'\05DC\05DE\05D8\05E4\05DC \05D4\05DE\05EA\05E4\05EA\05D7',
   jsonb_build_array(U&'\05DB\05DC \05D4\05EA\05DB\05E0\05D9\05DD \05E9\05DC \05D7\05D9\05E0\05DD', U&'\05E7\05D5\05E8\05E1\05D9\05DD \05DE\05EA\05E7\05D3\05DE\05D9\05DD \05D1\05E2\05E1\05E7', U&'\05DB\05DC\05D9 AI \05DE\05EA\05E7\05D3\05DE\05D9\05DD', U&'\05D4\05D5\05E8\05D3\05EA \05D7\05D5\05DE\05E8\05D9\05DD'), false),
  ('premium', U&'\05E4\05E8\05D9\05DE\05D9\05D5\05DD', 99, U&'\05DC\05E6\05DE\05D9\05D7\05D4 \05DE\05D4\05D9\05E8\05D4',
   jsonb_build_array(U&'\05DB\05DC \05D4\05EA\05DB\05E0\05D9\05DD \05E9\05DC \05D1\05E1\05D9\05E1\05D9', U&'\05E7\05D5\05E8\05E1\05D9 \05DE\05D9\05DC\05D5\05D9 \05E7\05DC\05D9\05E0\05D9\05E7\05D4', U&'\05EA\05D1\05E0\05D9\05D5\05EA \05E9\05D9\05D5\05D5\05E7 \05DE\05D5\05DB\05E0\05D5\05EA', U&'\05E9\05D9\05D7\05D5\05EA \05D9\05D9\05E2\05D5\05E5 \05D7\05D5\05D3\05E9\05D9\05D5\05EA'), true),
  ('vip', U&'VIP', 149, U&'\05DC\05D9\05D5\05D5\05D9 \05D0\05D9\05E9\05D9 \05DE\05DC\05D0',
   jsonb_build_array(U&'\05DB\05DC \05D4\05EA\05DB\05E0\05D9\05DD \05E9\05DC \05E4\05E8\05D9\05DE\05D9\05D5\05DD', U&'\05DC\05D9\05D5\05D5\05D9 \05D0\05D9\05E9\05D9 1:1', U&'\05D2\05D9\05E9\05D4 \05DC\05EA\05DB\05E0\05D9\05DD \05D1\05DC\05E2\05D3\05D9\05D9\05DD', U&'\05E7\05D1\05D5\05E6\05EA \05DE\05D0\05E1\05D8\05E8\05DE\05D9\05D9\05E0\05D3'), false)
ON CONFLICT (tier) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_tier_plans_meta() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tier_plans_meta ON public.tier_plans;
CREATE TRIGGER tier_plans_meta BEFORE UPDATE ON public.tier_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_tier_plans_meta();

-- בדיקה: צריך להחזיר plans_table = true ו-plans_count = 4
SELECT to_regclass('public.tier_plans') IS NOT NULL AS plans_table,
       (SELECT count(*) FROM public.tier_plans) AS plans_count;
