BEGIN;

CREATE TABLE public.daily_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('task', 'note')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  remark text NOT NULL DEFAULT '' CHECK (char_length(remark) <= 4000),
  status text NOT NULL DEFAULT 'working' CHECK (status IN ('todo', 'working', 'done', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE FUNCTION public.set_daily_queue_closed_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.kind = 'task' AND NEW.status IN ('done', 'cancelled') THEN
    IF TG_OP = 'UPDATE' AND OLD.closed_at IS NOT NULL THEN
      NEW.closed_at := OLD.closed_at;
    ELSE
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER daily_queue_closed_at BEFORE INSERT OR UPDATE ON public.daily_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_daily_queue_closed_at();
CREATE INDEX daily_queue_closed_at_idx ON public.daily_queue (closed_at) WHERE closed_at IS NOT NULL;

ALTER TABLE public.daily_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_queue TO authenticated;
CREATE POLICY daily_queue_read ON public.daily_queue FOR SELECT TO authenticated
  USING (closed_at IS NULL OR closed_at > now() - interval '24 hours');
CREATE POLICY daily_queue_add ON public.daily_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY daily_queue_edit ON public.daily_queue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY daily_queue_delete ON public.daily_queue FOR DELETE TO authenticated USING (true);

CREATE FUNCTION public.purge_closed_daily_queue() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.daily_queue WHERE closed_at <= now() - interval '24 hours';
$$;
REVOKE ALL ON FUNCTION public.purge_closed_daily_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_closed_daily_queue() TO authenticated;

COMMIT;
