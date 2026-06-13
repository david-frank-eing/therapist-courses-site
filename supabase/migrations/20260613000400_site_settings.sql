-- ============================================================
-- Site settings (singleton) — editable site content managed by admin.
-- Public read; admin-only update. One row, id = 1.
-- ============================================================

CREATE TABLE public.site_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  contact_email TEXT,
  contact_phone TEXT,
  contact_address TEXT,
  social_facebook TEXT,
  social_instagram TEXT,
  social_linkedin TEXT,
  social_youtube TEXT,
  about_title TEXT,
  about_text TEXT,
  hero_badge TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_singleton CHECK (id = 1)
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read site settings
CREATE POLICY "Anyone can view site settings"
  ON public.site_settings FOR SELECT
  USING (true);

-- Only admins can update
CREATE POLICY "Admins can update site settings"
  ON public.site_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the single row (empty — frontend falls back to defaults until edited)
INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
