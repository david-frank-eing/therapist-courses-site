-- Fix: recalculate last_visit when a session is deleted.
-- The INSERT/UPDATE trigger only moves last_visit forward.
-- Deleting the most recent session would leave last_visit stale.

CREATE OR REPLACE FUNCTION public.recalc_client_last_visit_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _max_date DATE;
BEGIN
  SELECT MAX(date) INTO _max_date
  FROM public.sessions
  WHERE client_id = OLD.client_id;

  UPDATE public.clients
  SET last_visit = _max_date,
      updated_at = now()
  WHERE id = OLD.client_id;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_recalc_last_visit_on_delete
  AFTER DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.recalc_client_last_visit_on_delete();
