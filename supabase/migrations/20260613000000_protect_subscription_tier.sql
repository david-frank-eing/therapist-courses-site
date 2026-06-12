-- ============================================================
-- SECURITY FIX (ISSUE-001): prevent users from escalating their
-- own subscription_tier.
--
-- The "Users can update their own profile" RLS policy gates which
-- ROW a user may update (their own) but not which COLUMNS. Since
-- subscription_tier lives on that row, any authenticated user could
-- self-promote to 'vip'. This trigger forces the protected columns
-- back to their previous values for non-admins, closing the hole
-- while leaving legitimate edits (full_name, avatar_url) intact.
-- Admins (UsersManager) can still change tiers freely.
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_profile_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Admins may change anything (tier management via the admin panel)
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Non-admins: silently keep the existing tier / expiry
  NEW.subscription_tier := OLD.subscription_tier;
  NEW.subscription_expires_at := OLD.subscription_expires_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_tier_trigger ON public.profiles;

CREATE TRIGGER protect_profile_tier_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_tier();
