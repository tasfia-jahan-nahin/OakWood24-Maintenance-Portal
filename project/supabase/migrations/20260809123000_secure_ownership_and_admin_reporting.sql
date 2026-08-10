-- Secure multi-user ownership, admin reporting, and admin-only activity logs

-- 1. Create helper to detect admin users
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Designated admin by role OR by specific email address
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
  OR (
    SELECT email FROM auth.users WHERE id = auth.uid()
  ) = 'ptasfia789@gmail.com';
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- 2. Ensure profiles table supports roles, display_name, and avatar_url
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN display_name text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'coordinator' CHECK (role IN ('admin','coordinator'));
  END IF;
END $$;

-- 3. Prevent regular users from changing their profile role directly
CREATE OR REPLACE FUNCTION public.prevent_role_change_for_non_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Regular users are not allowed to change their role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_role_change ON profiles;
CREATE TRIGGER trg_profiles_prevent_role_change
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change_for_non_admin();

-- 4. Ensure every candidate has a user_id and report missing ownership
DO $$
DECLARE
  v_orphan_count int;
  v_admin_id uuid;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count FROM public.candidates WHERE user_id IS NULL;
  IF v_orphan_count > 0 THEN
    RAISE NOTICE 'Found % candidate rows with missing user_id. Assigning them to the first admin account.', v_orphan_count;
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NULL THEN
      RAISE EXCEPTION 'No admin profile found to assign orphan candidates. Please create an admin profile first.';
    END IF;
    UPDATE public.candidates SET user_id = v_admin_id WHERE user_id IS NULL;
  END IF;
END $$;

-- 5. Candidate ownership policies
DROP POLICY IF EXISTS "select_own_candidates" ON candidates;
CREATE POLICY "select_candidates" ON candidates FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin_user());

DROP POLICY IF EXISTS "insert_own_candidates" ON candidates;
CREATE POLICY "insert_candidates" ON candidates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin_user());

DROP POLICY IF EXISTS "update_own_candidates" ON candidates;
CREATE POLICY "update_candidates" ON candidates FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR public.is_admin_user())
  WITH CHECK (auth.uid() = user_id OR public.is_admin_user());

DROP POLICY IF EXISTS "delete_own_candidates" ON candidates;
CREATE POLICY "delete_candidates" ON candidates FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR public.is_admin_user());

-- 6. Prevent regular users from transferring candidate ownership
CREATE OR REPLACE FUNCTION public.prevent_candidate_user_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'Regular users are not allowed to transfer candidate ownership';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidates_prevent_user_transfer ON candidates;
CREATE TRIGGER trg_candidates_prevent_user_transfer
BEFORE UPDATE ON candidates
FOR EACH ROW EXECUTE FUNCTION public.prevent_candidate_user_transfer();

-- 7. Candidate-linked object policies
DROP POLICY IF EXISTS "select_all_chase_actions" ON chase_actions;
CREATE POLICY "select_chase_actions" ON chase_actions FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.candidates
      WHERE candidates.id = chase_actions.candidate_id
        AND (candidates.user_id = auth.uid() OR public.is_admin_user())
    )
  );

DROP POLICY IF EXISTS "insert_own_chase_actions" ON chase_actions;
CREATE POLICY "insert_chase_actions" ON chase_actions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "select_all_change_history" ON change_history;
CREATE POLICY "select_change_history" ON change_history FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.candidates
      WHERE candidates.id = change_history.candidate_id
        AND (candidates.user_id = auth.uid() OR public.is_admin_user())
    )
  );

DROP POLICY IF EXISTS "insert_own_change_history" ON change_history;
CREATE POLICY "insert_change_history" ON change_history FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "select_own_compliance_items" ON compliance_items;
CREATE POLICY "select_compliance_items" ON compliance_items FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.candidates
      WHERE candidates.id = compliance_items.candidate_id
        AND (candidates.user_id = auth.uid() OR public.is_admin_user())
    )
  );

DROP POLICY IF EXISTS "insert_own_compliance_items" ON compliance_items;
CREATE POLICY "insert_compliance_items" ON compliance_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidates
      WHERE candidates.id = compliance_items.candidate_id
        AND candidates.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_compliance_items" ON compliance_items;
CREATE POLICY "update_compliance_items" ON compliance_items FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.candidates
      WHERE candidates.id = compliance_items.candidate_id
        AND (candidates.user_id = auth.uid() OR public.is_admin_user())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.candidates
      WHERE candidates.id = compliance_items.candidate_id
        AND candidates.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_own_compliance_items" ON compliance_items;
CREATE POLICY "delete_compliance_items" ON compliance_items FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.candidates
      WHERE candidates.id = compliance_items.candidate_id
        AND (candidates.user_id = auth.uid() OR public.is_admin_user())
    )
  );

-- 8. Auth activity logs for login/logout events
CREATE TABLE IF NOT EXISTS auth_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  display_name text,
  event_type text NOT NULL CHECK (event_type IN ('login','logout')),
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auth_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_auth_activity_logs_admin" ON auth_activity_logs;
CREATE POLICY "select_auth_activity_logs_admin" ON auth_activity_logs FOR SELECT
  TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS "insert_auth_activity_logs" ON auth_activity_logs;
CREATE POLICY "insert_auth_activity_logs" ON auth_activity_logs FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

-- 9. Team summary RPC
CREATE OR REPLACE FUNCTION public.fetch_team_summary()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  total_candidates int,
  active_candidates int,
  inactive_candidates int,
  no_zoho_candidates int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(p.display_name, '') AS display_name,
    COUNT(c.*) AS total_candidates,
    COUNT(c.*) FILTER (WHERE c.status = 'active' AND NOT c.goodbye_email_sent) AS active_candidates,
    COUNT(c.*) FILTER (WHERE c.status = 'inactive' AND NOT c.goodbye_email_sent) AS inactive_candidates,
    COUNT(c.*) FILTER (WHERE c.status = 'no_zoho_remark') AS no_zoho_candidates
  FROM public.profiles p
  LEFT JOIN public.candidates c ON c.user_id = p.id
  GROUP BY p.id, p.display_name;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_team_summary() TO authenticated;

-- 10. Ensure only admins can query auth activity logs via RPC if needed
CREATE OR REPLACE FUNCTION public.log_auth_activity(
  p_event_type text,
  p_details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_display_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to log activity';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  SELECT display_name INTO v_display_name FROM public.profiles WHERE id = v_user_id;

  INSERT INTO public.auth_activity_logs (user_id, user_email, display_name, event_type, details)
  VALUES (v_user_id, v_user_email, v_display_name, p_event_type, p_details);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_auth_activity(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_auth_activity_logs(limit_rows int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email text,
  display_name text,
  event_type text,
  details text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admins may access authentication activity logs';
  END IF;

  RETURN QUERY
  SELECT id, user_id, user_email, display_name, event_type, details, created_at
  FROM public.auth_activity_logs
  ORDER BY created_at DESC
  LIMIT limit_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_auth_activity_logs(int) TO authenticated;
