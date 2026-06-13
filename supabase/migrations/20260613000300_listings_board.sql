-- ============================================================
-- Bulletin board (לוח מודעות)
-- Public read, registered users post, contact details hidden from
-- anonymous visitors (enforced at the DB column level).
-- ============================================================

-- 1. Category enum
CREATE TYPE public.listing_category AS ENUM (
  'clinic_room',  -- השכרת חדר קליניקה
  'jobs',         -- דרושים / שיתופי פעולה
  'workshops',    -- סדנאות ואירועים
  'equipment'     -- ציוד למכירה
);

-- 2. Listings table
CREATE TABLE public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category listing_category NOT NULL,
  price TEXT,
  city TEXT,
  image_path TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Anyone sees active listings; owners & admins also see their inactive ones
CREATE POLICY "Anyone can view active listings"
  ON public.listings FOR SELECT
  USING (
    is_active = true
    OR auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
  );

-- Only authenticated users can post, and only as themselves
CREATE POLICY "Authenticated users can create their own listings"
  ON public.listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Owners and admins can edit
CREATE POLICY "Owners and admins can update listings"
  ON public.listings FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Owners and admins can delete
CREATE POLICY "Owners and admins can delete listings"
  ON public.listings FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Hide contact columns from anonymous (not-logged-in) visitors.
--    RLS is row-level; column privileges hide specific fields. The public
--    list never selects these; only authenticated users can read them.
REVOKE SELECT (contact_name, contact_phone, contact_email)
  ON public.listings FROM anon;

-- 4. Public storage bucket for listing images (meant to be seen by everyone)
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-images', 'listing-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view images; authenticated users upload; owners/admins manage
CREATE POLICY "Anyone can view listing images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-images');

CREATE POLICY "Authenticated users can upload listing images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'listing-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users manage their own listing images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'listing-images' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users delete their own listing images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'listing-images' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));
