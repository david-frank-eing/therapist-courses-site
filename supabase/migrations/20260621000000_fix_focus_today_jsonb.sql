-- Change focus_today from TEXT[] to JSONB to support {emoji, text} objects
ALTER TABLE public.weekly_plan
  ALTER COLUMN focus_today TYPE JSONB USING to_jsonb(focus_today),
  ALTER COLUMN focus_today SET DEFAULT '[]';
