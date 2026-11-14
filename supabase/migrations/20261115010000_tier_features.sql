-- פיצול "כלי עבודה" לארבע יכולות נפרדות (15/11/2026).
-- עד עכשיו הייתה הרשאה אחת, paid_tools, שפתחה לדרגה את הכול יחד. מעכשיו יש ארבע, ודוד מסמן כל אחת
-- בנפרד לכל דרגה, בלשונית "דרגות":
--   clients  מטופלים            (clients, sessions, events)
--   tasks    תזכורות ומשימות    (tasks, habit_definitions, habits_log, weekly_plan, daily_plan, time_log, journal_entries)
--   booking  זימון תורים        (booking_profiles, availability_slots, booking_notifs)
--   content  תוכן ופרסום        (content_items, publishing_log)
--
-- ההרצה עצמה לא משנה כלום לאף משתמש: כל יכולת חדשה מקבלת את מה שמסומן היום ב-paid_tools.
-- מנהל תמיד מורשה. קריאה ומחיקה של הנתונים שלך נשארות תמיד; רק יצירה ועדכון תלויים ביכולת.
-- has_paid_tier נשאר, ומשמעותו עכשיו "יש לפחות יכולת אחת" (הטבלאות הכלליות של הדשבורד משתמשות בו).
-- בטוח להרצה חוזרת. לא מוחק נתונים. דורש שהקובץ "טבלת הרשאות" (6) כבר רץ.

-- דף המחירים ציבורי ומציג מה כל דרגה פותחת, אז גם אורח קורא את הטבלה
DROP POLICY IF EXISTS "Anyone reads tier access" ON public.tier_access;
CREATE POLICY "Anyone reads tier access" ON public.tier_access
  FOR SELECT USING (true);

INSERT INTO public.tier_access (feature, tier, allowed)
SELECT f.feature, t.tier,
       COALESCE(pt.allowed, t.tier IN ('premium', 'vip'))
FROM unnest(ARRAY['clients', 'tasks', 'booking', 'content']) AS f(feature)
CROSS JOIN unnest(ARRAY['free', 'basic', 'premium', 'vip']) AS t(tier)
LEFT JOIN public.tier_access pt ON pt.feature = 'paid_tools' AND pt.tier = t.tier
ON CONFLICT (feature, tier) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_feature(_uid UUID, _feature TEXT)
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
               WHERE a.feature = _feature AND a.tier = p.subscription_tier::text),
             (SELECT a.allowed FROM public.tier_access a
               WHERE a.feature = 'paid_tools' AND a.tier = p.subscription_tier::text),
             p.subscription_tier::text IN ('premium', 'vip')
           )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_paid_tier(_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_feature(_uid, 'clients') OR public.has_feature(_uid, 'tasks')
      OR public.has_feature(_uid, 'booking') OR public.has_feature(_uid, 'content')
$$;

DO $$
DECLARE
  m TEXT[];
  t TEXT;
  f TEXT;
  locked_out TEXT;
BEGIN
  SELECT string_agg(u.email, ', ') INTO locked_out
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.is_admin = true
    AND NOT (public.has_feature(p.id, 'clients') AND public.has_feature(p.id, 'tasks')
             AND public.has_feature(p.id, 'booking') AND public.has_feature(p.id, 'content'));
  IF locked_out IS NOT NULL THEN
    RAISE EXCEPTION 'Stopped, nothing changed: these admins would lose write access: %', locked_out;
  END IF;

  FOREACH m SLICE 1 IN ARRAY ARRAY[
    ['clients', 'clients'], ['sessions', 'clients'], ['events', 'clients'],
    ['tasks', 'tasks'], ['habit_definitions', 'tasks'], ['habits_log', 'tasks'], ['weekly_plan', 'tasks'],
    ['daily_plan', 'tasks'], ['time_log', 'tasks'], ['journal_entries', 'tasks'],
    ['booking_profiles', 'booking'], ['availability_slots', 'booking'], ['booking_notifs', 'booking'],
    ['content_items', 'content'], ['publishing_log', 'content']
  ] LOOP
    t := m[1]; f := m[2];
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipped (no such table): %', t;
      CONTINUE;
    END IF;
    -- the older names used by clients / sessions
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Paid owners create ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Paid owners update ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Approved owner creates ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Approved owner updates ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id AND public.has_feature(auth.uid(), %L))',
                   'Approved owner creates ' || t, t, f);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id AND public.has_feature(auth.uid(), %L)) '
                   'WITH CHECK (auth.uid() = user_id AND public.has_feature(auth.uid(), %L))',
                   'Approved owner updates ' || t, t, f, f);
  END LOOP;
END;
$$;

-- בדיקה: feature_rows = 16, tables_by_feature = 15 (או פחות אם טבלה לא קיימת), old_policies_left = 0, admins_pass = true
SELECT
  (SELECT count(*) FROM public.tier_access WHERE feature IN ('clients', 'tasks', 'booking', 'content')) AS feature_rows,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'Approved owner creates %'
     AND with_check LIKE '%has_feature%') AS tables_by_feature,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'Paid owners %') AS old_policies_left,
  (SELECT bool_and(public.has_paid_tier(id)) FROM public.profiles WHERE is_admin = true) AS admins_pass;
