CREATE TABLE public.google_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  google_email TEXT DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner google_tokens" ON public.google_tokens
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
