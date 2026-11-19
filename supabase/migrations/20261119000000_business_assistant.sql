-- Business assistant for the clinic (19/11/2026): conversations, saved plans, admin config, usage counters.
-- Rules this file keeps:
--   * the browser can NOT write conversations at all (only the Netlify function, with the service key, can),
--     so nobody can forge a history or inject messages;
--   * a signed-in user can read and delete only his own conversations and plans;
--   * the admin sees what people asked through a function that does NOT return user_id (anonymous questions);
--   * guests and anonymous visitors have no table access at all.
-- Safe to run twice. Deletes nothing. No Hebrew text in this file on purpose.

-- 1. conversations ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL for a guest. SET NULL (not CASCADE) so the anonymous question text survives a deleted account.
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- sha256 of a random token kept in the guest's browser; lets a guest continue his own conversation
  guest_hash       TEXT CHECK (guest_hash IS NULL OR char_length(guest_hash) = 64),
  track            TEXT NOT NULL DEFAULT 'first_clients' CHECK (char_length(track) <= 40),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'locked')),
  turns            INTEGER NOT NULL DEFAULT 0 CHECK (turns >= 0),
  off_topic_count  INTEGER NOT NULL DEFAULT 0 CHECK (off_topic_count >= 0),
  messages         JSONB NOT NULL DEFAULT '[]'::jsonb
                   CHECK (jsonb_typeof(messages) = 'array' AND octet_length(messages::text) <= 80000),
  result           JSONB CHECK (result IS NULL OR octet_length(result::text) <= 12000)
);

CREATE INDEX IF NOT EXISTS assistant_conv_user_idx    ON public.assistant_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS assistant_conv_created_idx ON public.assistant_conversations (created_at DESC);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_conversations FROM anon;
REVOKE INSERT, UPDATE ON public.assistant_conversations FROM authenticated;

DROP POLICY IF EXISTS "Own conversations: read" ON public.assistant_conversations;
CREATE POLICY "Own conversations: read" ON public.assistant_conversations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own conversations: remove" ON public.assistant_conversations;
CREATE POLICY "Own conversations: remove" ON public.assistant_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- 2. what the admin sees: the questions, without who asked --------------------------------------------------------
-- is_registered only says "a signed-in user" or "a guest" (user_id IS NOT NULL); the identity itself is never returned
DROP FUNCTION IF EXISTS public.admin_assistant_questions(INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_assistant_questions(p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, track TEXT, status TEXT, turns INTEGER, off_topic_count INTEGER, is_registered BOOLEAN, messages JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY
    SELECT c.id, c.created_at, c.track, c.status, c.turns, c.off_topic_count, (c.user_id IS NOT NULL), c.messages
    FROM public.assistant_conversations c
    ORDER BY c.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
    OFFSET GREATEST(p_offset, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_assistant_questions(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assistant_questions(INTEGER, INTEGER) TO authenticated;

-- 3. the admin's instructions to the assistant (one row) -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assistant_config (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  guidelines     TEXT NOT NULL DEFAULT '',
  question_bank  TEXT NOT NULL DEFAULT '',
  examples       TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- keeps the prompt (and the bill) small
  CONSTRAINT assistant_config_size CHECK (char_length(guidelines) + char_length(question_bank) + char_length(examples) <= 8000)
);
INSERT INTO public.assistant_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.assistant_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_config FROM anon;

DROP POLICY IF EXISTS "Admins manage assistant config" ON public.assistant_config;
CREATE POLICY "Admins manage assistant config" ON public.assistant_config
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. saved plans (written by the signed-in user himself, from the browser) -------------------------------------
CREATE TABLE IF NOT EXISTS public.business_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  track             TEXT NOT NULL DEFAULT 'first_clients' CHECK (char_length(track) <= 40),
  business_summary  TEXT NOT NULL DEFAULT '' CHECK (char_length(business_summary) <= 1200),
  channel           TEXT NOT NULL DEFAULT '' CHECK (char_length(channel) <= 200),
  why               TEXT NOT NULL DEFAULT '' CHECK (char_length(why) <= 800),
  actions           JSONB NOT NULL DEFAULT '[]'::jsonb
                    CHECK (jsonb_typeof(actions) = 'array' AND jsonb_array_length(actions) = 3 AND octet_length(actions::text) <= 3000),
  outreach_message  TEXT NOT NULL DEFAULT '' CHECK (char_length(outreach_message) <= 1500),
  next_step         TEXT NOT NULL DEFAULT '' CHECK (char_length(next_step) <= 400),
  conversation_id   UUID
);

CREATE INDEX IF NOT EXISTS business_plans_user_idx ON public.business_plans (user_id, updated_at DESC);

-- at most 20 plans per user, so the table cannot be filled by one account
CREATE OR REPLACE FUNCTION public.business_plans_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM public.business_plans WHERE user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION 'plan limit reached';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS business_plans_limit_trg ON public.business_plans;
CREATE TRIGGER business_plans_limit_trg BEFORE INSERT ON public.business_plans
  FOR EACH ROW EXECUTE FUNCTION public.business_plans_limit();

CREATE OR REPLACE FUNCTION public.business_plans_touch() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS business_plans_touch_trg ON public.business_plans;
CREATE TRIGGER business_plans_touch_trg BEFORE UPDATE ON public.business_plans
  FOR EACH ROW EXECUTE FUNCTION public.business_plans_touch();

ALTER TABLE public.business_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_plans FROM anon;

DROP POLICY IF EXISTS "Own plans: read" ON public.business_plans;
CREATE POLICY "Own plans: read" ON public.business_plans FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Own plans: add" ON public.business_plans;
CREATE POLICY "Own plans: add" ON public.business_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Own plans: update" ON public.business_plans;
CREATE POLICY "Own plans: update" ON public.business_plans FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Own plans: remove" ON public.business_plans;
CREATE POLICY "Own plans: remove" ON public.business_plans FOR DELETE USING (auth.uid() = user_id);

-- 5. usage counters for the rate limits (only the Netlify function, with the service key) ---------------------
CREATE TABLE IF NOT EXISTS public.assistant_usage (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- a user id, or "ip:" + a keyed hash of the address (the address itself is never stored)
  subject     TEXT NOT NULL CHECK (char_length(subject) <= 80),
  kind        TEXT NOT NULL DEFAULT 'call' CHECK (char_length(kind) <= 20)
);
CREATE INDEX IF NOT EXISTS assistant_usage_subject_idx ON public.assistant_usage (subject, created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_usage_created_idx ON public.assistant_usage (created_at DESC);

ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_usage FROM anon, authenticated;

-- check: rls_on must be true everywhere, anon_can_select false everywhere
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assistant_conversations'::regclass) AS conv_rls_on,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assistant_config'::regclass)        AS config_rls_on,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_plans'::regclass)         AS plans_rls_on,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assistant_usage'::regclass)        AS usage_rls_on,
  has_table_privilege('anon', 'public.assistant_conversations', 'SELECT') AS anon_can_read_conv,
  has_table_privilege('anon', 'public.business_plans', 'SELECT')          AS anon_can_read_plans,
  has_table_privilege('authenticated', 'public.assistant_conversations', 'INSERT') AS user_can_write_conv;
