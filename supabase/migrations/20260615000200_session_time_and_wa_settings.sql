-- Add session time field
ALTER TABLE public.sessions ADD COLUMN session_time TIME;

-- Add WhatsApp (GreenAPI) settings per user
ALTER TABLE public.profiles
  ADD COLUMN wa_instance_id TEXT,
  ADD COLUMN wa_api_token  TEXT,
  ADD COLUMN wa_reminder_template TEXT DEFAULT 'שלום {שם}, תזכורת לפגישה שלנו {מתי} בשעה {שעה}. נתראה! 🙏';
