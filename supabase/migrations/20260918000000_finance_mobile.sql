-- ============================================================
-- Finance on the phone (Carlos finance, plan 6)
-- finance_state: what the PC uploads. Only the service role writes it.
-- finance_requests: taps on the phone. The browser only inserts 'pending'; the PC (via Netlify) updates.
-- Both: only the owner, and only if the owner is admin.
-- ============================================================

CREATE TABLE public.finance_state (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB,
  made_at    TIMESTAMP WITH TIME ZONE,
  pc_seen_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.finance_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin owner reads finance_state" ON public.finance_state FOR SELECT
  USING (auth.uid() = user_id
         AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE TABLE public.finance_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cmd        TEXT NOT NULL CHECK (cmd IN ('receipt-confirm', 'receipt-discard', 'mark-sent',
                                          'vendor-category', 'vendor-domain', 'domains-accept-all')),
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(payload) < 4000),
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  result     JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  picked_at  TIMESTAMP WITH TIME ZONE,
  done_at    TIMESTAMP WITH TIME ZONE
);
CREATE INDEX finance_requests_user_status ON public.finance_requests (user_id, status, created_at);
ALTER TABLE public.finance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin owner reads finance_requests" ON public.finance_requests FOR SELECT
  USING (auth.uid() = user_id
         AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));
CREATE POLICY "Admin owner asks finance_requests" ON public.finance_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id
              AND status = 'pending' AND result IS NULL AND picked_at IS NULL AND done_at IS NULL
              AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));
-- no UPDATE / DELETE policies: only the service role (finance-sync) changes requests
