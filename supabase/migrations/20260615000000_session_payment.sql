-- Add is_paid field to sessions
ALTER TABLE public.sessions ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT false;

-- Trigger: auto-update client last_visit when a session is inserted or updated
CREATE OR REPLACE FUNCTION public.sync_client_last_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clients
  SET last_visit = NEW.date,
      updated_at = now()
  WHERE id = NEW.client_id
    AND (last_visit IS NULL OR NEW.date >= last_visit);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_last_visit
  AFTER INSERT OR UPDATE OF date ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_last_visit();
