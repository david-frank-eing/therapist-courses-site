-- Leads from the /welcome landing page (18/11/2026).
-- A visitor leaves name, phone and email and ticks a consent box. The row is written ONLY by the
-- Netlify function lead-submit (it uses the service key, which bypasses RLS), so the public
-- cannot read or write this table directly. Only an admin can read and update it.
-- Safe to run twice. Deletes nothing. No Hebrew text in this file on purpose.

CREATE TABLE IF NOT EXISTS public.leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  phone         TEXT NOT NULL CHECK (phone ~ '^0[0-9]{8,9}$'),
  email         TEXT NOT NULL CHECK (char_length(email) <= 120 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'),
  note          TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  -- the consent box: must be true, and we keep when it was given
  consent       BOOLEAN NOT NULL CHECK (consent = true),
  consent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  source        TEXT NOT NULL DEFAULT '' CHECK (char_length(source) <= 40),
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'not_relevant')),
  handled_note  TEXT NOT NULL DEFAULT '' CHECK (char_length(handled_note) <= 500)
);

CREATE INDEX IF NOT EXISTS leads_created_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_phone_idx   ON public.leads (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_email_idx   ON public.leads (email, created_at DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- no policy for anonymous visitors at all, and no table grant either
REVOKE ALL ON public.leads FROM anon;

DROP POLICY IF EXISTS "Admins manage leads" ON public.leads;
CREATE POLICY "Admins manage leads" ON public.leads
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- check: should return rls_on = true and anon_can_select = false
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.leads'::regclass) AS rls_on,
  has_table_privilege('anon', 'public.leads', 'SELECT') AS anon_can_select;
