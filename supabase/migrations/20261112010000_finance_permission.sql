-- ============================================================
-- 12/11/2026 — finance becomes its own permission.
-- Before: the finance area was tied to is_admin.
-- Now:    profiles.finance_enabled, switched per user by the admin
--         ("ניהול משתמשים" → 💰 כספים). Default off for everyone;
--         whoever is admin today keeps finance.
-- Safe to run more than once. Nothing here deletes data.
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS finance_enabled BOOLEAN NOT NULL DEFAULT false;

-- whoever has finance today (the admin) keeps it
UPDATE public.profiles SET finance_enabled = true WHERE is_admin = true AND finance_enabled = false;

-- a user cannot switch finance on for themselves (same pattern as protect_profile_is_admin)
CREATE OR REPLACE FUNCTION public.protect_profile_finance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.finance_enabled := false;
  ELSE
    NEW.finance_enabled := OLD.finance_enabled;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_finance_trigger ON public.profiles;
CREATE TRIGGER protect_profile_finance_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_finance();

-- the finance tables follow the new switch instead of is_admin
DROP POLICY IF EXISTS "Admin owner reads finance_state" ON public.finance_state;
DROP POLICY IF EXISTS "Finance owner reads finance_state" ON public.finance_state;
CREATE POLICY "Finance owner reads finance_state" ON public.finance_state FOR SELECT
  USING (auth.uid() = user_id
         AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.finance_enabled = true));

DROP POLICY IF EXISTS "Admin owner reads finance_requests" ON public.finance_requests;
DROP POLICY IF EXISTS "Finance owner reads finance_requests" ON public.finance_requests;
CREATE POLICY "Finance owner reads finance_requests" ON public.finance_requests FOR SELECT
  USING (auth.uid() = user_id
         AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.finance_enabled = true));

DROP POLICY IF EXISTS "Admin owner asks finance_requests" ON public.finance_requests;
DROP POLICY IF EXISTS "Finance owner asks finance_requests" ON public.finance_requests;
CREATE POLICY "Finance owner asks finance_requests" ON public.finance_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id
              AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.finance_enabled = true));

-- ── check (one row) ──
SELECT
  (SELECT string_agg(u.email, ', ') FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.finance_enabled = true)
    AS finance_users,                            -- expected: only your own email
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND tgname = 'protect_profile_finance_trigger')
    AS finance_protect_trigger,                  -- expected: 1
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('finance_state', 'finance_requests') AND policyname LIKE 'Finance owner%')
    AS finance_policies,                         -- expected: 3
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('finance_state', 'finance_requests') AND policyname LIKE 'Admin owner%')
    AS old_admin_policies;                       -- expected: 0
