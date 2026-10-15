CREATE OR REPLACE FUNCTION public.discover_candidate_sites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  discovered_site record;
  discovered_site_id uuid;
BEGIN
  FOR discovered_site IN
    SELECT DISTINCT ON (lower(btrim(value)))
      btrim(value) AS name
    FROM jsonb_each_text(COALESCE(NEW.extra_data, '{}'::jsonb)) AS item(key, value)
    WHERE (
        lower(item.key) LIKE '%trust%'
        OR lower(item.key) LIKE '%client%'
        OR lower(item.key) LIKE '%hospital%'
      )
      AND length(btrim(value)) > 0
    ORDER BY lower(btrim(value)), btrim(value)
  LOOP
    discovered_site_id := NULL;

    INSERT INTO public.sites (name, source, created_by)
    VALUES (discovered_site.name, 'candidate_import', NEW.user_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO discovered_site_id;

    IF discovered_site_id IS NULL THEN
      SELECT id
      INTO discovered_site_id
      FROM public.sites
      WHERE lower(btrim(name)) = lower(btrim(discovered_site.name))
      LIMIT 1;
    END IF;

    IF discovered_site_id IS NOT NULL THEN
      INSERT INTO public.candidate_site_assignments (site_id, candidate_id)
      VALUES (discovered_site_id, NEW.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_discover_candidate_sites ON public.candidates;
CREATE TRIGGER trg_discover_candidate_sites
  AFTER INSERT ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.discover_candidate_sites();

DROP TRIGGER IF EXISTS trg_discover_candidate_sites_extra_data ON public.candidates;
CREATE TRIGGER trg_discover_candidate_sites_extra_data
  AFTER UPDATE OF extra_data ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.discover_candidate_sites();

GRANT SELECT, INSERT ON public.sites TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.candidate_site_assignments TO authenticated;

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

INSERT INTO public.candidate_site_assignments (site_id, candidate_id)
SELECT DISTINCT site.id, c.id
FROM public.candidates c
CROSS JOIN LATERAL jsonb_each_text(COALESCE(c.extra_data, '{}'::jsonb)) AS item(key, value)
JOIN public.sites site
  ON lower(btrim(site.name)) = lower(btrim(item.value))
WHERE (
    lower(item.key) LIKE '%trust%'
    OR lower(item.key) LIKE '%client%'
    OR lower(item.key) LIKE '%hospital%'
  )
  AND length(btrim(item.value)) > 0
ON CONFLICT DO NOTHING;
