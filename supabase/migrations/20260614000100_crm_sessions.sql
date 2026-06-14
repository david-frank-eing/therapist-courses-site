-- ============================================================
-- CRM stage 2: sessions (פגישות) per client.
-- Owner-only access — same RLS pattern as clients.
-- ============================================================

CREATE TYPE public.session_type AS ENUM ('initial', 'followup', 'group', 'phone', 'other');

CREATE TABLE public.sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id   UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  type        session_type NOT NULL DEFAULT 'followup',
  duration_minutes INTEGER,
  price       NUMERIC(10,2),
  notes       TEXT,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Owners delete their sessions"
  ON public.sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Paid owners create sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.has_paid_tier(auth.uid()));

CREATE POLICY "Paid owners update sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id AND public.has_paid_tier(auth.uid()));
