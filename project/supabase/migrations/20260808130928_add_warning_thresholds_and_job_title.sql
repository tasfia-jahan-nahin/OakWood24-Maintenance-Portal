/*
# Add warning threshold columns and job_title to candidates

1. Changes to `reminder_settings` table:
   - `first_warning_days` (integer, default 15): Days before expiry to trigger 1st warning email.
   - `second_warning_days` (integer, default 7): Days before expiry to trigger 2nd warning / Do Not Book.

2. Changes to `candidates` table:
   - `job_title` (text, nullable): Dynamic job role/designation imported from Excel (e.g., Registered Nurse, HCA, Senior Carer).
   - `extra_data` (jsonb, nullable): Stores any extra columns from Excel that don't map to known fields, preserving all imported data.

3. Security:
   - No changes to RLS policies. Existing policies remain in effect.
*/

-- Add warning threshold columns to reminder_settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminder_settings' AND column_name = 'first_warning_days') THEN
    ALTER TABLE reminder_settings ADD COLUMN first_warning_days integer NOT NULL DEFAULT 15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminder_settings' AND column_name = 'second_warning_days') THEN
    ALTER TABLE reminder_settings ADD COLUMN second_warning_days integer NOT NULL DEFAULT 7;
  END IF;
END $$;

-- Add job_title and extra_data to candidates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'job_title') THEN
    ALTER TABLE candidates ADD COLUMN job_title text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'extra_data') THEN
    ALTER TABLE candidates ADD COLUMN extra_data jsonb;
  END IF;
  -- Proof-of-address expiry values are intentionally not top-level columns in the DB schema;
  -- keep them in extra_data to match the actual Supabase schema and avoid schema-cache mismatches.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'proof_of_address_1_expiry') THEN
    -- no-op: column intentionally omitted to avoid PostgREST column mismatch
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'proof_of_address_2_expiry') THEN
    -- no-op: column intentionally omitted to avoid PostgREST column mismatch
  END IF;
END $$;

-- Ensure auth_activity_logs exists for background login/logout tracking and fail gracefully when absent.
CREATE TABLE IF NOT EXISTS auth_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  display_name text,
  event_type text NOT NULL CHECK (event_type IN ('login','logout')),
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
