-- ============================================================
-- CRM stage 1: client management (private per therapist).
-- Owner-only access — NO admin policy (client data is sensitive,
-- admins must not read other therapists' clients). Create/edit
-- require a paid tier (premium/vip); read/delete always allowed to
-- the owner so a downgraded user is never locked out of their data.
-- ============================================================

-- Helper: does this user hold a paid subscription tier?
CREATE OR REPLACE FUNCTION public.has_paid_tier(_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _uid AND subscription_tier IN ('premium', 'vip')
  )
$$;

CREATE TYPE public.client_status AS ENUM ('lead', 'active', 'inactive');

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status client_status NOT NULL DEFAULT 'active',
  last_visit DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Owner can always read their own clients
CREATE POLICY "Owners read their clients"
  ON public.clients FOR SELECT
  USING (auth.uid() = user_id);

-- Owner can always delete their own clients
CREATE POLICY "Owners delete their clients"
  ON public.clients FOR DELETE
  USING (auth.uid() = user_id);

-- Creating requires a paid tier
CREATE POLICY "Paid owners create clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.has_paid_tier(auth.uid()));

-- Editing requires a paid tier
CREATE POLICY "Paid owners update clients"
  ON public.clients FOR UPDATE
  USING (auth.uid() = user_id AND public.has_paid_tier(auth.uid()));

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
