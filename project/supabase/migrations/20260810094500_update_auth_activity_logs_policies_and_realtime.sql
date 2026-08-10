-- 20260810094500_update_auth_activity_logs_policies_and_realtime.sql

ALTER TABLE auth_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read all logs" ON auth_activity_logs;
DROP POLICY IF EXISTS "Allow authenticated users to insert logs" ON auth_activity_logs;
DROP POLICY IF EXISTS "select_auth_activity_logs_admin" ON auth_activity_logs;
DROP POLICY IF EXISTS "insert_auth_activity_logs" ON auth_activity_logs;

CREATE POLICY "Allow authenticated users to read all logs"
  ON auth_activity_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert logs"
  ON auth_activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE auth_activity_logs;
