CREATE TABLE IF NOT EXISTS public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'candidate_import')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sites_name_normalized_unique
  ON public.sites (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.candidate_site_assignments (
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS candidate_site_assignments_candidate_idx
  ON public.candidate_site_assignments (candidate_id);

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_site_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_sites_authenticated" ON public.sites;
CREATE POLICY "select_sites_authenticated" ON public.sites
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_sites_authenticated" ON public.sites;
CREATE POLICY "insert_sites_authenticated" ON public.sites
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "select_candidate_site_assignments" ON public.candidate_site_assignments;
CREATE POLICY "select_candidate_site_assignments" ON public.candidate_site_assignments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_site_assignments.candidate_id
        AND (c.user_id = auth.uid() OR public.is_admin_user())
    )
  );

DROP POLICY IF EXISTS "insert_candidate_site_assignments" ON public.candidate_site_assignments;
CREATE POLICY "insert_candidate_site_assignments" ON public.candidate_site_assignments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_site_assignments.candidate_id
        AND (c.user_id = auth.uid() OR public.is_admin_user())
    )
  );

DROP POLICY IF EXISTS "delete_candidate_site_assignments" ON public.candidate_site_assignments;
CREATE POLICY "delete_candidate_site_assignments" ON public.candidate_site_assignments
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_site_assignments.candidate_id
        AND (c.user_id = auth.uid() OR public.is_admin_user())
    )
  );

CREATE OR REPLACE FUNCTION public.discover_candidate_sites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.sites (name, source, created_by)
  SELECT DISTINCT ON (lower(btrim(value)))
    btrim(value),
    'candidate_import',
    NEW.user_id
  FROM jsonb_each_text(COALESCE(NEW.extra_data, '{}'::jsonb)) AS item(key, value)
  WHERE (
      lower(item.key) LIKE '%trust%'
      OR lower(item.key) LIKE '%client%'
      OR lower(item.key) LIKE '%hospital%'
    )
    AND length(btrim(value)) > 0
  ORDER BY lower(btrim(value)), btrim(value)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_discover_candidate_sites ON public.candidates;
CREATE TRIGGER trg_discover_candidate_sites
  AFTER INSERT OR UPDATE OF extra_data ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.discover_candidate_sites();

INSERT INTO public.sites (name, source, created_by)
SELECT DISTINCT ON (lower(btrim(item.value)))
  btrim(item.value),
  'candidate_import',
  c.user_id
FROM public.candidates c
CROSS JOIN LATERAL jsonb_each_text(COALESCE(c.extra_data, '{}'::jsonb)) AS item(key, value)
WHERE (
    lower(item.key) LIKE '%trust%'
    OR lower(item.key) LIKE '%client%'
    OR lower(item.key) LIKE '%hospital%'
  )
  AND length(btrim(item.value)) > 0
ORDER BY lower(btrim(item.value)), btrim(item.value)
ON CONFLICT DO NOTHING;
