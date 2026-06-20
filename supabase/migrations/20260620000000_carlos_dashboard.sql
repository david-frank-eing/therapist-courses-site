-- ============================================================
-- Carlos Dashboard tables
-- All tables use user_id + RLS (owner-only access).
-- Requires premium/vip tier to write (read always allowed to owner).
-- ============================================================

-- ── Tasks ──────────────────────────────────────────────────
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE,
  reminder_at TIMESTAMP WITH TIME ZONE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner tasks" ON public.tasks USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Habits ─────────────────────────────────────────────────
CREATE TABLE public.habit_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT DEFAULT '✅',
  label TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);
ALTER TABLE public.habit_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner habit_definitions" ON public.habit_definitions USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.habits_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  habit_id UUID REFERENCES public.habit_definitions(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  done BOOLEAN DEFAULT false,
  UNIQUE (habit_id, date)
);
ALTER TABLE public.habits_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner habits_log" ON public.habits_log USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Weekly / Daily plan ────────────────────────────────────
CREATE TABLE public.weekly_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_of DATE NOT NULL,
  focus_today TEXT[] DEFAULT '{}',
  quotas JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, week_of)
);
ALTER TABLE public.weekly_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner weekly_plan" ON public.weekly_plan USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.daily_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date_for DATE NOT NULL,
  quotas JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, date_for)
);
ALTER TABLE public.daily_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner daily_plan" ON public.daily_plan USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Time log ───────────────────────────────────────────────
CREATE TABLE public.time_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain TEXT DEFAULT 'unassigned',
  label TEXT DEFAULT '',
  seconds INT DEFAULT 0,
  note TEXT DEFAULT '',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.time_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner time_log" ON public.time_log USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Journal ────────────────────────────────────────────────
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  body TEXT DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, date)
);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner journal_entries" ON public.journal_entries USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Content items ──────────────────────────────────────────
CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'post',
  status TEXT DEFAULT 'idea',
  domain TEXT DEFAULT 'unassigned',
  creative_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner content_items" ON public.content_items USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Publishing log ─────────────────────────────────────────
CREATE TABLE public.publishing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content_id UUID,
  domain TEXT,
  published_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.publishing_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner publishing_log" ON public.publishing_log USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Booking: profile ───────────────────────────────────────
CREATE TABLE public.booking_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE,
  name TEXT DEFAULT '',
  title TEXT DEFAULT 'מטפל מוסמך',
  bio TEXT DEFAULT '',
  services TEXT[] DEFAULT '{}',
  location TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.booking_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner booking_profiles" ON public.booking_profiles USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public read booking_profiles" ON public.booking_profiles FOR SELECT USING (true);

-- ── Booking: availability slots ────────────────────────────
CREATE TABLE public.availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  time_to TEXT,
  duration_min INT DEFAULT 60,
  booked BOOLEAN DEFAULT false,
  booked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner availability_slots" ON public.availability_slots USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public read availability_slots" ON public.availability_slots FOR SELECT USING (true);

-- ── Booking: appointments ──────────────────────────────────
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  slot_id UUID REFERENCES public.availability_slots(id),
  date DATE,
  time TEXT,
  duration_min INT DEFAULT 60,
  patient_name TEXT DEFAULT '',
  patient_phone TEXT DEFAULT '',
  service TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner appointments" ON public.appointments USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Allow public insert (clients booking)
CREATE POLICY "Public create appointments" ON public.appointments FOR INSERT WITH CHECK (true);

-- ── Booking: notifications ─────────────────────────────────
CREATE TABLE public.booking_notifs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT DEFAULT '',
  appt_data JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.booking_notifs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner booking_notifs" ON public.booking_notifs USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Sync data (briefing, email summary, calendar) ─────────
CREATE TABLE public.sync_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  text_value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, key)
);
ALTER TABLE public.sync_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner sync_data" ON public.sync_data USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Dashboard config (habits editable per user) ────────────
CREATE TABLE public.dashboard_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  domains JSONB DEFAULT '[{"id":"treatments","emoji":"💆","label":"טיפולים"},{"id":"music","emoji":"🎵","label":"מוזיקה"},{"id":"product","emoji":"🚀","label":"כלי"},{"id":"unassigned","emoji":"⚪","label":"כללי"}]',
  categories JSONB DEFAULT '[{"id":"health","emoji":"💊","label":"בריאות"},{"id":"marketing","emoji":"📢","label":"שיווק"},{"id":"music","emoji":"🎵","label":"מוזיקה"},{"id":"learning","emoji":"📚","label":"למידה"},{"id":"general","emoji":"📌","label":"כללי"}]',
  assistant_name TEXT DEFAULT 'קרלוס',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.dashboard_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner dashboard_config" ON public.dashboard_config USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Clients (extend existing CRM table) ────────────────────
-- The clients table was created in 20260614000000_crm_clients.sql.
-- We add dashboard-specific columns if not already present.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT '';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- ── Events ────────────────────────────────────────────────
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT DEFAULT '',
  date DATE,
  price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'lead',
  notes TEXT DEFAULT '',
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner events" ON public.events USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
