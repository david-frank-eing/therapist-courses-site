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
  perks        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- רשימת הטבות בטקסט חופשי (לא נאכף)
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
  ('free',    'חינם',    0,   'התחלה מושלמת',
   '["גישה לקורסים בסיסיים", "תוכן AI למתחילים", "שאלות ותשובות בקהילה"]'::jsonb, false),
  ('basic',   'בסיסי',   49,  'למטפל המתפתח',
   '["כל התכנים של חינם", "קורסים מתקדמים בעסק", "כלי AI מתקדמים", "הורדת חומרים"]'::jsonb, false),
  ('premium', 'פרימיום', 99,  'לצמיחה מהירה',
   '["כל התכנים של בסיסי", "קורסי מילוי קליניקה", "תבניות שיווק מוכנות", "שיחות ייעוץ חודשיות"]'::jsonb, true),
  ('vip',     'VIP',     149, 'ליווי אישי מלא',
   '["כל התכנים של פרימיום", "ליווי אישי 1:1", "גישה לתכנים בלעדיים", "קבוצת מאסטרמיינד"]'::jsonb, false)
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
