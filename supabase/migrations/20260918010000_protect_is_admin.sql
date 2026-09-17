-- ============================================================
-- SECURITY FIX: users could make themselves admin.
-- "Users can update their own profile" limits the ROW, not the COLUMNS,
-- and protect_profile_tier() only guards the subscription columns.
-- is_admin opens admin mode in the Carlos dashboard.
-- This adds a separate trigger (the existing one is left untouched):
-- only a real admin (user_roles) or the server (no logged-in user) may change is_admin.
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_profile_is_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
  ELSE
    NEW.is_admin := OLD.is_admin;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_is_admin_trigger ON public.profiles;
CREATE TRIGGER protect_profile_is_admin_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_is_admin();

-- check (one row): the new trigger exists, and admins are unchanged
select
  (select string_agg(tgname, ', ') from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal) as profiles_triggers,
  (select string_agg(u.email, ', ') from public.profiles p join auth.users u on u.id = p.id where p.is_admin = true) as is_admin_users;
