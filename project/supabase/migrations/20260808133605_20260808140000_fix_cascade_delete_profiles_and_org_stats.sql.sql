/*
# Fix Cascade Delete, Add Profile Columns, Add Org Dashboard Stats

## 1. Fix clear_all_candidates RPC
- Updated to delete from dependent tables (chase_actions, change_history, compliance_items) BEFORE deleting candidates
- This prevents foreign key constraint violations that caused "Failed to clear database" errors
- Also logs the audit entry before deletion so it survives

## 2. Add Profile Columns
- Added `display_name` (text, nullable) to profiles table
- Added `avatar_url` (text, nullable) to profiles table
- Users can now set a display name and avatar in Settings

## 3. Add DELETE Policies
- Added DELETE policy on change_history for authenticated users (own entries)
- Added DELETE policy on chase_actions for authenticated users (own entries)
- Added DELETE policy on audit_logs for authenticated users (own entries)
- These are needed so the cascade delete in the RPC can work properly

## 4. Add Org Dashboard Stats Function
- New SECURITY DEFINER function `fetch_org_dashboard_stats` that returns aggregate counts across ALL users
- Returns: total_candidates, active_candidates, inactive_candidates, no_zoho_candidates, today_chase, do_not_book, goodbye_email_sent
- This allows dashboard metric cards to show org-wide counts while candidate lists remain user-scoped

## 5. Add upsert_profile function
- New SECURITY DEFINER function to upsert profile data (display_name, avatar_url)
- Allows users to update their own profile
*/

-- 2. Add profile columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'display_name') THEN
    ALTER TABLE profiles ADD COLUMN display_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'avatar_url') THEN
    ALTER TABLE profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

-- 3. Add DELETE policies on dependent tables
DROP POLICY IF EXISTS "delete_own_change_history" ON change_history;
CREATE POLICY "delete_own_change_history"
ON change_history FOR DELETE
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_chase_actions" ON chase_actions;
CREATE POLICY "delete_own_chase_actions"
ON chase_actions FOR DELETE
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_audit_logs" ON audit_logs;
CREATE POLICY "delete_own_audit_logs"
ON audit_logs FOR DELETE
TO authenticated USING (auth.uid() = user_id);

-- 1. Fix clear_all_candidates RPC - cascade delete dependent tables first
CREATE OR REPLACE FUNCTION clear_all_candidates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- Log the clear action BEFORE deleting
  INSERT INTO change_history (candidate_id, user_id, user_email, action, old_value, new_value, entity_type)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_user_id,
    v_user_email,
    'database.clear_all',
    NULL,
    'Database cleared by ' || COALESCE(v_user_email, 'Unknown') || ' on ' || to_char(now(), 'DD/MM/YYYY HH24:MI'),
    'system'
  );

  -- Delete dependent rows first to avoid FK constraint violations
  DELETE FROM chase_actions WHERE candidate_id IN (SELECT id FROM candidates WHERE user_id = v_user_id);
  DELETE FROM change_history WHERE candidate_id IN (SELECT id FROM candidates WHERE user_id = v_user_id) AND candidate_id != '00000000-0000-0000-0000-000000000000'::uuid;
  DELETE FROM compliance_items WHERE candidate_id IN (SELECT id FROM candidates WHERE user_id = v_user_id);

  -- Now delete all candidates owned by the current user
  DELETE FROM candidates WHERE user_id = v_user_id;
END;
$$;

-- 4. Add org dashboard stats function (aggregate across all users)
CREATE OR REPLACE FUNCTION fetch_org_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_active int;
  v_inactive int;
  v_no_zoho int;
  v_goodbye int;
  v_today_chase int;
  v_do_not_book int;
  v_settings record;
BEGIN
  SELECT * INTO v_settings FROM reminder_settings LIMIT 1;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'active' AND NOT goodbye_email_sent),
    COUNT(*) FILTER (WHERE status = 'inactive' AND NOT goodbye_email_sent),
    COUNT(*) FILTER (WHERE status = 'no_zoho_remark'),
    COUNT(*) FILTER (WHERE goodbye_email_sent)
  INTO v_total, v_active, v_inactive, v_no_zoho, v_goodbye
  FROM candidates;

  -- Count today's chase and do not book using date math
  SELECT
    COUNT(DISTINCT c.id) FILTER (
      WHERE NOT c.goodbye_email_sent AND (
        (c.dbs_expiry_date IS NOT NULL AND c.dbs_expiry_date <= CURRENT_DATE + COALESCE(v_settings.dbs_reminder_days, 30)) OR
        (c.passport_expiry_date IS NOT NULL AND c.passport_expiry_date <= CURRENT_DATE + COALESCE(v_settings.passport_reminder_days, 30)) OR
        (c.rtw_expiry_date IS NOT NULL AND c.rtw_expiry_date <= CURRENT_DATE + COALESCE(v_settings.rtw_reminder_days, 30)) OR
        (c.pmva_expiry_date IS NOT NULL AND c.pmva_expiry_date <= CURRENT_DATE + COALESCE(v_settings.pmva_reminder_days, 30)) OR
        (c.training_expiry_date IS NOT NULL AND c.training_expiry_date <= CURRENT_DATE + COALESCE(v_settings.training_reminder_days, 20))
      )
    ),
    COUNT(DISTINCT c.id) FILTER (
      WHERE NOT c.goodbye_email_sent AND (
        (c.dbs_expiry_date IS NOT NULL AND c.dbs_expiry_date < CURRENT_DATE) OR
        (c.passport_expiry_date IS NOT NULL AND c.passport_expiry_date < CURRENT_DATE) OR
        (c.rtw_expiry_date IS NOT NULL AND c.rtw_expiry_date < CURRENT_DATE) OR
        (c.pmva_expiry_date IS NOT NULL AND c.pmva_expiry_date < CURRENT_DATE) OR
        (c.training_expiry_date IS NOT NULL AND c.training_expiry_date < CURRENT_DATE) OR
        (c.pmva_expiry_date IS NOT NULL AND NOT c.pmva_verification_completed) OR
        (c.training_expiry_date IS NOT NULL AND NOT c.training_verification_completed)
      )
    )
  INTO v_today_chase, v_do_not_book
  FROM candidates c;

  RETURN json_build_object(
    'totalCandidates', v_total,
    'activeCandidates', v_active,
    'inactiveCandidates', v_inactive,
    'noZohoCandidates', v_no_zoho,
    'todayChase', v_today_chase,
    'doNotBook', v_do_not_book,
    'goodbyeEmailSent', v_goodbye
  );
END;
$$;

-- 5. Add upsert_profile function
CREATE OR REPLACE FUNCTION upsert_profile(p_display_name text, p_avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, name, role, display_name, avatar_url, created_at)
  VALUES (auth.uid(), COALESCE(p_display_name, ''), 'coordinator', p_display_name, p_avatar_url, now())
  ON CONFLICT (id) DO UPDATE
  SET display_name = p_display_name, avatar_url = p_avatar_url;
END;
$$;

-- Grant execute on new functions
GRANT EXECUTE ON FUNCTION fetch_org_dashboard_stats TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_profile TO authenticated;
