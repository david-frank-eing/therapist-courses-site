-- ============================================================
-- 12/11/2026 — "waiting for approval" is enforced by the database.
-- Before: a signed-up but not-yet-approved user saw a waiting screen,
--         but could still write to the dashboard tables directly.
-- Now:    creating or changing rows needs an approved account
--         (public.has_paid_tier: premium / vip — the same rule the
--         clients table already uses). Reading and deleting your own
--         rows stays as it was.
--
-- Safety: the script first checks that every current admin passes
-- has_paid_tier. If one does not, it stops before changing anything.
-- Safe to run more than once. Nothing here deletes data.
-- ============================================================

DO $$
DECLARE
  t TEXT;
  locked_out TEXT;
BEGIN
  SELECT string_agg(u.email, ', ') INTO locked_out
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
  WHERE p.is_admin = true AND NOT public.has_paid_tier(p.id);
  IF locked_out IS NOT NULL THEN
    RAISE EXCEPTION 'Stopped, nothing changed: these admins are not premium/vip and would lose write access: %', locked_out;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'tasks', 'habit_definitions', 'habits_log', 'weekly_plan', 'daily_plan', 'time_log', 'journal_entries',
    'content_items', 'publishing_log', 'booking_profiles', 'availability_slots', 'booking_notifs',
    'sync_data', 'dashboard_config', 'events', 'usage_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipped (no such table): %', t;
      CONTINUE;
    END IF;
    -- the old single rule ("Owner <table>": everything for the owner) becomes four
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Owner ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Owner reads ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Owner deletes ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Approved owner creates ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Approved owner updates ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id)', 'Owner reads ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id)', 'Owner deletes ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id AND public.has_paid_tier(auth.uid()))',
                   'Approved owner creates ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id AND public.has_paid_tier(auth.uid())) '
                   'WITH CHECK (auth.uid() = user_id AND public.has_paid_tier(auth.uid()))',
                   'Approved owner updates ' || t, t);
  END LOOP;
END;
$$;

-- ── check (one row) ──
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'Approved owner creates %')
    AS tables_requiring_approval_to_create,      -- expected: 16 (or fewer if a table does not exist)
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'Owner %' AND cmd = 'ALL'
     AND tablename IN ('tasks', 'habit_definitions', 'habits_log', 'weekly_plan', 'daily_plan', 'time_log', 'journal_entries',
                       'content_items', 'publishing_log', 'booking_profiles', 'availability_slots', 'booking_notifs',
                       'sync_data', 'dashboard_config', 'events', 'usage_events'))
    AS old_all_in_one_policies_left,             -- expected: 0
  (SELECT string_agg(u.email, ', ') FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE public.has_paid_tier(p.id))
    AS approved_users;                           -- expected: you, and anyone you approved
