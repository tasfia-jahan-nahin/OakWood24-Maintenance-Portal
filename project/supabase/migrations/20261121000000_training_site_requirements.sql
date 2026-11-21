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
CREATE POLICY training_requirements_read ON public.training_site_requirements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS training_requirements_insert ON public.training_site_requirements;
CREATE POLICY training_requirements_insert ON public.training_site_requirements
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS training_requirements_update ON public.training_site_requirements;
CREATE POLICY training_requirements_update ON public.training_site_requirements
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

NOTIFY pgrst, 'reload schema';
