-- ============================================================
-- 12/11/2026 — hardening before more people get access.
-- Safe to run more than once. Nothing here deletes data.
--
--   1. Google tokens are no longer readable from the browser.
--   2. Public booking: one atomic function, a constrained insert rule,
--      and a flood guard.
--   The last statement prints a one-row check.
-- ============================================================

-- ── 1. google_tokens: the browser may see *that* Google is connected, never the tokens ──
-- The Netlify functions use the service key and are not affected.
-- The dashboard only reads google_email + updated_at, and deletes the row on "disconnect".
REVOKE ALL ON public.google_tokens FROM anon;
REVOKE ALL ON public.google_tokens FROM authenticated;
GRANT SELECT (user_id, google_email, updated_at) ON public.google_tokens TO authenticated;
GRANT DELETE ON public.google_tokens TO authenticated;

-- ── 2a. A public appointment must point at a real, free slot of the same therapist ──
-- Before: WITH CHECK (true) — anyone could insert any row for any user.
-- (The owner's own inserts are still covered by the "Owner appointments" policy.)
DROP POLICY IF EXISTS "Public create appointments" ON public.appointments;
CREATE POLICY "Public create appointments" ON public.appointments
  FOR INSERT
  WITH CHECK (
    appointments.status = 'confirmed'
    AND appointments.slot_id IS NOT NULL
    AND char_length(btrim(coalesce(appointments.patient_name, ''))) BETWEEN 2 AND 80
    AND char_length(btrim(coalesce(appointments.patient_phone, ''))) BETWEEN 7 AND 25
    AND char_length(coalesce(appointments.service, '')) <= 120
    AND char_length(coalesce(appointments.notes, '')) <= 1000
    AND EXISTS (
      SELECT 1 FROM public.availability_slots s
      WHERE s.id = appointments.slot_id
        AND s.user_id = appointments.user_id
        AND s.booked = false
    )
  );

-- ── 2b. Flood guard: at most 20 appointments per therapist per hour from people who are not the therapist ──
CREATE OR REPLACE FUNCTION public.limit_public_appointments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM NEW.user_id THEN
    IF (SELECT count(*) FROM public.appointments a
        WHERE a.user_id = NEW.user_id AND a.created_at > now() - interval '1 hour') >= 20 THEN
      RAISE EXCEPTION 'too many bookings in the last hour' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS limit_public_appointments_trigger ON public.appointments;
CREATE TRIGGER limit_public_appointments_trigger
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.limit_public_appointments();

-- ── 2c. book_slot: the whole booking in one step ──
-- An anonymous visitor cannot update availability_slots or insert booking_notifs (owner-only rows),
-- so the old three-call flow left a booked slot bookable and saved no notification.
-- Returns {"ok": true} or {"ok": false, "reason": "taken" | "invalid" | "busy"}.
CREATE OR REPLACE FUNCTION public.book_slot(p_slot UUID, p_name TEXT, p_phone TEXT, p_service TEXT DEFAULT '', p_notes TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_slot   public.availability_slots%ROWTYPE;
  v_name   TEXT := btrim(coalesce(p_name, ''));
  v_phone  TEXT := btrim(coalesce(p_phone, ''));
  v_service TEXT := left(btrim(coalesce(p_service, '')), 120);
  v_notes  TEXT := left(coalesce(p_notes, ''), 1000);
BEGIN
  IF char_length(v_name) NOT BETWEEN 2 AND 80
     OR char_length(v_phone) NOT BETWEEN 7 AND 25
     OR v_phone !~ '^[+0-9][0-9 ()./-]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  -- lock the slot so two people cannot take it in the same instant
  SELECT * INTO v_slot FROM public.availability_slots WHERE id = p_slot FOR UPDATE;
  IF NOT FOUND OR v_slot.booked OR v_slot.date < (now() AT TIME ZONE 'Asia/Jerusalem')::date THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  IF (SELECT count(*) FROM public.appointments a
      WHERE a.user_id = v_slot.user_id AND a.created_at > now() - interval '1 hour') >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'busy');
  END IF;

  INSERT INTO public.appointments (user_id, slot_id, date, time, duration_min, patient_name, patient_phone, service, notes, status)
  VALUES (v_slot.user_id, v_slot.id, v_slot.date, v_slot.time, coalesce(v_slot.duration_min, 60), v_name, v_phone, v_service, v_notes, 'confirmed');

  UPDATE public.availability_slots SET booked = true, booked_at = now() WHERE id = v_slot.id;

  INSERT INTO public.booking_notifs (user_id, text, appt_data, read)
  VALUES (v_slot.user_id,
          'תור חדש: ' || v_name || ' — ' || v_slot.date::text || ' ' || v_slot.time,
          jsonb_build_object('name', v_name, 'phone', v_phone, 'date', v_slot.date, 'time', v_slot.time, 'service', v_service),
          false);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.book_slot(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_slot(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── check (one row) ──
SELECT
  (SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'google_tokens' AND grantee = 'authenticated' AND privilege_type = 'SELECT')
    AS google_tokens_readable_columns,          -- expected: google_email, updated_at, user_id
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments' AND policyname = 'Public create appointments' AND with_check <> 'true')
    AS constrained_booking_policy,               -- expected: 1
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'limit_public_appointments_trigger')
    AS flood_guard_trigger,                      -- expected: 1
  (SELECT count(*) FROM pg_proc WHERE proname = 'book_slot' AND pronamespace = 'public'::regnamespace)
    AS book_slot_function;                       -- expected: 1
