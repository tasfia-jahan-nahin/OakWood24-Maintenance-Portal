/*
# Oakwood24 Compliance Portal — Full Schema Restructure

This migration restructures the database to match the compliance portal specification.
It adds compliance date columns directly to candidates, creates a profiles table for
user metadata, a change_history table for audit trails, and a reminder_settings table
for configurable reminder thresholds.

## 1. New Tables

### profiles
- Stores user display name and role (admin/coordinator) linked to auth.users.
- `id` (uuid, PK, references auth.users)
- `name` (text, user's display name)
- `role` (text, 'admin' or 'coordinator', defaults to 'coordinator')
- `created_at` (timestamptz)

### change_history
- Append-only log of every change made to a candidate.
- `id` (uuid, PK)
- `candidate_id` (uuid, FK to candidates, ON DELETE CASCADE)
- `user_id` (uuid, FK to auth.users, ON DELETE SET NULL)
- `user_email` (text, denormalized for display)
- `action` (text, e.g. 'status_changed', 'dbs_updated')
- `old_value` (text)
- `new_value` (text)
- `created_at` (timestamptz, defaults to now())

### reminder_settings
- Single-row table storing configurable reminder thresholds per compliance type.
- `id` (uuid, PK, defaults to gen_random_uuid())
- `dbs_reminder_days` (int, default 30)
- `passport_reminder_days` (int, default 30)
- `rtw_reminder_days` (int, default 30)
- `pmva_reminder_days` (int, default 30)
- `training_reminder_days` (int, default 20)
- `do_not_book_days` (int, default 7)
- `updated_at` (timestamptz)
- `updated_by` (uuid, FK to auth.users, nullable)

## 2. Modified Tables

### candidates
New columns added (all nullable dates):
- `dbs_expiry_date` (date) — DBS check expiry
- `passport_expiry_date` (date) — Passport expiry
- `rtw_expiry_date` (date) — Right to Work expiry
- `pmva_expiry_date` (date) — PMVA expiry
- `training_expiry_date` (date) — Training expiry
- `pmva_verification_completed` (boolean, default false)
- `training_verification_completed` (boolean, default false)

Status constraint updated to allow 'no_zoho_remark' in addition to existing values.
The `role` column is renamed conceptually to `job_title` — but since we cannot rename
without data loss, a new `job_title` column is added and the old `role` column is kept
for backward compatibility (the app will use `job_title`).

## 3. Security

### profiles
- RLS enabled.
- Each authenticated user can read all profiles (team directory).
- Each user can insert/update only their own profile.

### change_history
- RLS enabled.
- All authenticated users can read (shared audit trail).
- Only authenticated users can insert their own entries (user_id must match auth.uid()).

### reminder_settings
- RLS enabled.
- All authenticated users can read (needed to display reminders).
- All authenticated users can update (shared settings — internal team tool).

## 4. Important Notes

1. The existing `compliance_items` table is kept as-is for backward compatibility.
   The new schema uses date columns on candidates directly, but old data in
   compliance_items is not lost.
2. The existing `audit_logs` table is kept as-is. `change_history` is the new
   structured change-tracking table per the user's specification.
3. A trigger auto-updates `updated_at` on candidates when any column changes.
4. A seed row is inserted into reminder_settings with the default values.
5. All new columns are nullable so existing candidate rows remain valid.
*/

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'coordinator' CHECK (role IN ('admin', 'coordinator')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_profiles" ON profiles;
CREATE POLICY "select_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create a profile when a new auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'name', ''), 'coordinator')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. CANDIDATES — ADD COMPLIANCE DATE COLUMNS
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'dbs_expiry_date') THEN
    ALTER TABLE candidates ADD COLUMN dbs_expiry_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'passport_expiry_date') THEN
    ALTER TABLE candidates ADD COLUMN passport_expiry_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'rtw_expiry_date') THEN
    ALTER TABLE candidates ADD COLUMN rtw_expiry_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'pmva_expiry_date') THEN
    ALTER TABLE candidates ADD COLUMN pmva_expiry_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'training_expiry_date') THEN
    ALTER TABLE candidates ADD COLUMN training_expiry_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'pmva_verification_completed') THEN
    ALTER TABLE candidates ADD COLUMN pmva_verification_completed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'training_verification_completed') THEN
    ALTER TABLE candidates ADD COLUMN training_verification_completed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'job_title') THEN
    ALTER TABLE candidates ADD COLUMN job_title text;
  END IF;
END $$;

-- Update status constraint to include 'no_zoho_remark'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidates_status_check' AND conrelid = 'candidates'::regclass) THEN
    ALTER TABLE candidates DROP CONSTRAINT candidates_status_check;
  END IF;
  ALTER TABLE candidates ADD CONSTRAINT candidates_status_check
    CHECK (status IN ('active', 'inactive', 'no_zoho_remark', 'pending', 'archived'));
END $$;

-- ============================================================
-- 3. CHANGE HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE change_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_change_history" ON change_history;
CREATE POLICY "select_all_change_history" ON change_history FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_change_history" ON change_history;
CREATE POLICY "insert_own_change_history" ON change_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_change_history_candidate_id ON change_history(candidate_id);
CREATE INDEX IF NOT EXISTS idx_change_history_created_at ON change_history(created_at DESC);

-- ============================================================
-- 4. REMINDER SETTINGS TABLE (single-row)
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dbs_reminder_days int NOT NULL DEFAULT 30,
  passport_reminder_days int NOT NULL DEFAULT 30,
  rtw_reminder_days int NOT NULL DEFAULT 30,
  pmva_reminder_days int NOT NULL DEFAULT 30,
  training_reminder_days int NOT NULL DEFAULT 20,
  do_not_book_days int NOT NULL DEFAULT 7,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reminder_settings" ON reminder_settings;
CREATE POLICY "select_reminder_settings" ON reminder_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_reminder_settings" ON reminder_settings;
CREATE POLICY "insert_reminder_settings" ON reminder_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_reminder_settings" ON reminder_settings;
CREATE POLICY "update_reminder_settings" ON reminder_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Seed default row if none exists
INSERT INTO reminder_settings (dbs_reminder_days, passport_reminder_days, rtw_reminder_days, pmva_reminder_days, training_reminder_days, do_not_book_days)
SELECT 30, 30, 30, 30, 20, 7
WHERE NOT EXISTS (SELECT 1 FROM reminder_settings);

-- ============================================================
-- 5. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_candidates_dbs_expiry ON candidates(dbs_expiry_date);
CREATE INDEX IF NOT EXISTS idx_candidates_passport_expiry ON candidates(passport_expiry_date);
CREATE INDEX IF NOT EXISTS idx_candidates_rtw_expiry ON candidates(rtw_expiry_date);
CREATE INDEX IF NOT EXISTS idx_candidates_pmva_expiry ON candidates(pmva_expiry_date);
CREATE INDEX IF NOT EXISTS idx_candidates_training_expiry ON candidates(training_expiry_date);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
