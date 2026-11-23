BEGIN;

-- Older installations use user_id; dashboard-updated installations can also use created_by.
CREATE OR REPLACE FUNCTION public.oakwood_candidate_owner(candidate_row jsonb)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(candidate_row->>'created_by', candidate_row->>'user_id')::uuid;
$$;

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oakwood_candidate_owner_access ON public.candidates;
CREATE POLICY oakwood_candidate_owner_access ON public.candidates FOR ALL TO authenticated
  USING (public.oakwood_candidate_owner(to_jsonb(candidates)) = (SELECT auth.uid()))
  WITH CHECK (public.oakwood_candidate_owner(to_jsonb(candidates)) = (SELECT auth.uid()));
DROP POLICY IF EXISTS oakwood_candidate_owner_boundary ON public.candidates;
CREATE POLICY oakwood_candidate_owner_boundary ON public.candidates AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (public.oakwood_candidate_owner(to_jsonb(candidates)) = (SELECT auth.uid()))
  WITH CHECK (public.oakwood_candidate_owner(to_jsonb(candidates)) = (SELECT auth.uid()));

-- Candidate-linked history follows candidate visibility, even with earlier admin policies.
ALTER TABLE public.chase_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oakwood_chase_candidate_boundary ON public.chase_actions;
CREATE POLICY oakwood_chase_candidate_boundary ON public.chase_actions AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = chase_actions.candidate_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = chase_actions.candidate_id));
DROP POLICY IF EXISTS oakwood_compliance_candidate_boundary ON public.compliance_items;
CREATE POLICY oakwood_compliance_candidate_boundary ON public.compliance_items AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = compliance_items.candidate_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = compliance_items.candidate_id));
DROP POLICY IF EXISTS oakwood_history_candidate_boundary ON public.change_history;
CREATE POLICY oakwood_history_candidate_boundary ON public.change_history AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = change_history.candidate_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = change_history.candidate_id));
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oakwood_audit_owner_boundary ON public.audit_logs;
CREATE POLICY oakwood_audit_owner_boundary ON public.audit_logs AS RESTRICTIVE FOR SELECT TO authenticated, anon
  USING (user_id = (SELECT auth.uid()));

-- Current app clears candidates through RLS. Retire older all-user RPC access if present.
DO $$
BEGIN
  IF to_regprocedure('public.clear_all_candidates()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.clear_all_candidates() FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.site_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS site_groups_owner_name_idx
  ON public.site_groups (created_by, lower(btrim(name)));
ALTER TABLE public.site_groups ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.site_groups TO authenticated;
DROP POLICY IF EXISTS oakwood_site_groups_owner ON public.site_groups;
CREATE POLICY oakwood_site_groups_owner ON public.site_groups FOR ALL TO authenticated
  USING (created_by = (SELECT auth.uid())) WITH CHECK (created_by = (SELECT auth.uid()));

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sites ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.site_groups(id) ON DELETE SET NULL;
ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_name_key;
DROP INDEX IF EXISTS public.sites_name_normalized_unique;
CREATE UNIQUE INDEX IF NOT EXISTS sites_owner_normalized_name_idx
  ON public.sites (created_by, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS sites_group_idx ON public.sites (group_id);
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;

DROP POLICY IF EXISTS oakwood_own_site_access ON public.sites;
CREATE POLICY oakwood_own_site_access ON public.sites FOR ALL TO authenticated
  USING (created_by = (SELECT auth.uid())) WITH CHECK (created_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS oakwood_own_site_boundary ON public.sites;
CREATE POLICY oakwood_own_site_boundary ON public.sites AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (
    created_by = (SELECT auth.uid()) AND
    (group_id IS NULL OR EXISTS (SELECT 1 FROM public.site_groups g WHERE g.id = sites.group_id))
  );

ALTER TABLE public.candidate_site_assignments ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.candidate_site_assignments ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.candidate_site_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.candidate_site_assignments TO authenticated;
DROP POLICY IF EXISTS oakwood_own_assignment_access ON public.candidate_site_assignments;
CREATE POLICY oakwood_own_assignment_access ON public.candidate_site_assignments FOR ALL TO authenticated
  USING (true) WITH CHECK (created_by = (SELECT auth.uid()));
DROP POLICY IF EXISTS oakwood_own_assignment_boundary ON public.candidate_site_assignments;
CREATE POLICY oakwood_own_assignment_boundary ON public.candidate_site_assignments AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (
    EXISTS (SELECT 1 FROM public.sites s WHERE s.id = candidate_site_assignments.site_id)
    AND EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_site_assignments.candidate_id)
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.sites s WHERE s.id = candidate_site_assignments.site_id)
    AND EXISTS (SELECT 1 FROM public.candidates c WHERE c.id = candidate_site_assignments.candidate_id)
  );

-- Retain automatic discovery on import, with separate sites for comma-separated locations.
CREATE OR REPLACE FUNCTION public.discover_candidate_sites()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  site_name text;
  location_id uuid;
  owner_id uuid := public.oakwood_candidate_owner(to_jsonb(NEW));
BEGIN
  IF owner_id IS NULL OR owner_id IS DISTINCT FROM auth.uid() THEN RETURN NEW; END IF;
  FOR site_name IN
    SELECT DISTINCT btrim(piece)
    FROM jsonb_each_text(CASE WHEN jsonb_typeof(NEW.extra_data) = 'object' THEN NEW.extra_data ELSE '{}'::jsonb END) AS field(key, value)
    CROSS JOIN LATERAL regexp_split_to_table(field.value, E'[,;|\\n]+') AS piece
    WHERE field.key ~* '(^|[^a-z])(trust|client|hospital)([^a-z]|$)' AND btrim(piece) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_each_text(CASE WHEN TG_OP = 'UPDATE' AND jsonb_typeof(OLD.extra_data) = 'object'
          THEN OLD.extra_data ELSE '{}'::jsonb END) AS old_field(key, value)
        CROSS JOIN LATERAL regexp_split_to_table(old_field.value, E'[,;|\\n]+') AS old_piece
        WHERE old_field.key ~* '(^|[^a-z])(trust|client|hospital)([^a-z]|$)'
          AND lower(btrim(old_piece)) = lower(btrim(piece))
      )
  LOOP
    INSERT INTO public.sites (name, source, created_by) VALUES (site_name, 'candidate_import', owner_id)
    ON CONFLICT DO NOTHING;
    SELECT s.id INTO location_id FROM public.sites s
    WHERE s.created_by = owner_id AND lower(btrim(s.name)) = lower(btrim(site_name));
    IF location_id IS NOT NULL THEN
      INSERT INTO public.candidate_site_assignments (site_id, candidate_id, created_by)
      VALUES (location_id, NEW.id, owner_id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_discover_candidate_sites ON public.candidates;
CREATE TRIGGER trg_discover_candidate_sites AFTER INSERT ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.discover_candidate_sites();
DROP TRIGGER IF EXISTS trg_discover_candidate_sites_extra_data ON public.candidates;
CREATE TRIGGER trg_discover_candidate_sites_extra_data AFTER UPDATE OF extra_data ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.discover_candidate_sites();

CREATE OR REPLACE FUNCTION public.remove_site_location(location_id uuid, move_to_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR location_id = move_to_id THEN RAISE EXCEPTION 'Choose a different destination site.'; END IF;
  PERFORM 1 FROM public.sites
    WHERE id IN (location_id, move_to_id) AND created_by = auth.uid() ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = location_id AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'This site is unavailable.';
  END IF;
  IF move_to_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = move_to_id AND created_by = auth.uid()) THEN
      RAISE EXCEPTION 'The destination site is unavailable.';
    END IF;
    INSERT INTO public.candidate_site_assignments (site_id, candidate_id, created_by)
    SELECT move_to_id, a.candidate_id, auth.uid() FROM public.candidate_site_assignments a
    WHERE a.site_id = location_id AND NOT EXISTS (
      SELECT 1 FROM public.candidate_site_assignments existing
      WHERE existing.site_id = move_to_id AND existing.candidate_id = a.candidate_id
    ) ON CONFLICT DO NOTHING;
  END IF;
  DELETE FROM public.sites WHERE id = location_id AND created_by = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_site_location(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_site_location(uuid, uuid) TO authenticated;

-- Published requirement lists are shared; candidate data is never stored here.
CREATE TABLE IF NOT EXISTS public.training_site_requirements (
  site_key text PRIMARY KEY CHECK (length(site_key) BETWEEN 1 AND 200),
  site_name text NOT NULL CHECK (length(site_name) BETWEEN 1 AND 200),
  courses text[] NOT NULL CHECK (cardinality(courses) BETWEEN 1 AND 250),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_site_requirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_site_requirements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_site_requirements TO authenticated;
DROP POLICY IF EXISTS training_requirements_read ON public.training_site_requirements;
CREATE POLICY training_requirements_read ON public.training_site_requirements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS training_requirements_insert ON public.training_site_requirements;
CREATE POLICY training_requirements_insert ON public.training_site_requirements FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());
DROP POLICY IF EXISTS training_requirements_update ON public.training_site_requirements;
CREATE POLICY training_requirements_update ON public.training_site_requirements FOR UPDATE TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

NOTIFY pgrst, 'reload schema';
COMMIT;
