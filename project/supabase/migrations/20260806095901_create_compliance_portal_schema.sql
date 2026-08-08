/*
# Oakwood24 Compliance Portal — Initial Schema

Creates the core tables for an internal healthcare recruitment compliance system.

## Tables
- `candidates` — healthcare professionals being tracked for compliance (name, role, email, phone, status, notes).
- `compliance_items` — individual compliance documents/credentials for a candidate (type, issue date, expiry date, status).
- `audit_logs` — append-only record of user actions across the portal (action, entity, entity_id, details).

## Security
- RLS enabled on every table.
- All tables are scoped to `authenticated` users (this app has a sign-in screen).
- `candidates` are owned by the user who creates them (`user_id DEFAULT auth.uid()`).
- `compliance_items` inherit ownership through their parent candidate.
- `audit_logs` are readable by all authenticated users (shared audit trail) but only insertable by the authenticated user themselves.

## Notes
1. `compliance_items` expiry status is derived in queries (expired / expiring soon / valid) from `expiry_date` vs `now()`.
2. `audit_logs` has `user_email` denormalized for easy display without joins.
3. All tables use `gen_random_uuid()` for primary keys.
*/

-- Candidates table
CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','inactive','archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_candidates" ON candidates;
CREATE POLICY "select_own_candidates" ON candidates FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_candidates" ON candidates;
CREATE POLICY "insert_own_candidates" ON candidates FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_candidates" ON candidates;
CREATE POLICY "update_own_candidates" ON candidates FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_candidates" ON candidates;
CREATE POLICY "delete_own_candidates" ON candidates FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Compliance items table
CREATE TABLE IF NOT EXISTS compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  type text NOT NULL,
  reference_number text,
  issue_date date,
  expiry_date date,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring','expired','pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_compliance_items" ON compliance_items;
CREATE POLICY "select_own_compliance_items" ON compliance_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM candidates WHERE candidates.id = compliance_items.candidate_id AND candidates.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_compliance_items" ON compliance_items;
CREATE POLICY "insert_own_compliance_items" ON compliance_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM candidates WHERE candidates.id = compliance_items.candidate_id AND candidates.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_compliance_items" ON compliance_items;
CREATE POLICY "update_own_compliance_items" ON compliance_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM candidates WHERE candidates.id = compliance_items.candidate_id AND candidates.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM candidates WHERE candidates.id = compliance_items.candidate_id AND candidates.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_compliance_items" ON compliance_items;
CREATE POLICY "delete_own_compliance_items" ON compliance_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM candidates WHERE candidates.id = compliance_items.candidate_id AND candidates.user_id = auth.uid())
  );

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_all_audit_logs" ON audit_logs;
CREATE POLICY "select_all_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_audit_logs" ON audit_logs;
CREATE POLICY "insert_own_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_candidate_id ON compliance_items(candidate_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_expiry_date ON compliance_items(expiry_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_candidates_updated_at ON candidates;
CREATE TRIGGER trg_candidates_updated_at BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_compliance_items_updated_at ON compliance_items;
CREATE TRIGGER trg_compliance_items_updated_at BEFORE UPDATE ON compliance_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();