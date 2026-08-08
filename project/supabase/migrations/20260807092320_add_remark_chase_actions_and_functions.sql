/*
# Oakwood24 Compliance Portal — Full Schema Upgrade

## 1. New Tables

### chase_actions
- Logs quick actions taken in the Chase Centre (email sent, called, waiting, completed).
- `id` (uuid, PK)
- `candidate_id` (uuid, FK to candidates, ON DELETE CASCADE)
- `user_id` (uuid, FK to auth.users, ON DELETE SET NULL)
- `user_email` (text, denormalized)
- `document_type` (text: 'dbs', 'passport', 'rtw', 'pmva', 'training')
- `action` (text: 'email_sent', 'called', 'waiting', 'completed')
- `note` (text, nullable)
- `created_at` (timestamptz)

## 2. Modified Tables

### candidates
New columns:
- `remark` (text, nullable) — stores remarks like "Goodbye Email Sent"
- `goodbye_email_sent` (boolean, default false) — derived flag for quick filtering

## 3. Security
- chase_actions: RLS enabled, authenticated users can read all and insert own.
- All existing policies preserved.

## 4. Important Notes
1. The `remark` column stores free-text remarks. The app checks if remark
   contains "Goodbye Email Sent" to set the goodbye_email_sent flag.
2. chase_actions is append-only (no update/delete policies) to maintain
   audit integrity.
3. change_history table (created in previous migration) is used for all
   audit logging via a SECURITY DEFINER function.
*/

-- ============================================================
-- 1. CANDIDATES — ADD REMARK COLUMN
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'remark') THEN
    ALTER TABLE candidates ADD COLUMN remark text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'goodbye_email_sent') THEN
    ALTER TABLE candidates ADD COLUMN goodbye_email_sent boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 2. CHANGE_HISTORY — ADD ENTITY_TYPE COLUMN
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_history' AND column_name = 'entity_type') THEN
    ALTER TABLE change_history ADD COLUMN entity_type text DEFAULT 'candidate';
  END IF;
END $$;

-- ============================================================
-- 3. CHASE ACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS chase_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  document_type text NOT NULL,
  action text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chase_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_chase_actions" ON chase_actions;
CREATE POLICY "select_all_chase_actions" ON chase_actions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_chase_actions" ON chase_actions;
CREATE POLICY "insert_own_chase_actions" ON chase_actions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_chase_actions_candidate_id ON chase_actions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_chase_actions_created_at ON chase_actions(created_at DESC);

-- ============================================================
-- 4. SECURITY DEFINER FUNCTION FOR CHANGE HISTORY
-- ============================================================
-- Allows the app to insert change_history entries without needing
-- direct INSERT policy on change_history (more secure).
CREATE OR REPLACE FUNCTION log_change_history(
  p_candidate_id uuid,
  p_action text,
  p_old_value text DEFAULT NULL,
  p_new_value text DEFAULT NULL,
  p_entity_type text DEFAULT 'candidate'
)
RETURNS void AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  INSERT INTO change_history (candidate_id, user_id, user_email, action, old_value, new_value, entity_type)
  VALUES (p_candidate_id, v_user_id, v_user_email, p_action, p_old_value, p_new_value, p_entity_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. SECURITY DEFINER FUNCTION FOR CLEAR ALL DATA
-- ============================================================
CREATE OR REPLACE FUNCTION clear_all_candidates()
RETURNS void AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Log the clear action BEFORE deleting (so the log entry survives)
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
  
  -- Delete all candidates owned by the current user
  DELETE FROM candidates WHERE user_id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_candidates_remark ON candidates(remark);
CREATE INDEX IF NOT EXISTS idx_candidates_goodbye_email ON candidates(goodbye_email_sent);
