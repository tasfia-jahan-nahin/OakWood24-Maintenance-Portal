BEGIN;

ALTER TABLE public.daily_queue ADD COLUMN added_by text;

CREATE FUNCTION public.set_daily_queue_creator() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  claims jsonb := auth.jwt();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.added_by := OLD.added_by;
  ELSE
    NEW.added_by := left(coalesce(
      nullif(btrim(claims->'user_metadata'->>'display_name'), ''),
      nullif(btrim(claims->'user_metadata'->>'full_name'), ''),
      nullif(btrim(claims->>'email'), '')
    ), 320);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER daily_queue_creator BEFORE INSERT OR UPDATE ON public.daily_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_queue_creator();

COMMIT;
