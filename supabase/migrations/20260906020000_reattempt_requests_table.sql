-- Create reattempt_requests table for managing student test re-take approvals
CREATE TABLE IF NOT EXISTS reattempt_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id TEXT NOT NULL,
  test_title TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  phone TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reattempt_requests_test_user ON reattempt_requests(test_id, user_id);
CREATE INDEX IF NOT EXISTS idx_reattempt_requests_status ON reattempt_requests(status);

ALTER TABLE reattempt_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert to reattempt_requests"
  ON reattempt_requests FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow read reattempt_requests"
  ON reattempt_requests FOR SELECT USING (true);

CREATE POLICY "Allow update reattempt_requests"
  ON reattempt_requests FOR UPDATE USING (true);

CREATE POLICY "Allow delete reattempt_requests"
  ON reattempt_requests FOR DELETE USING (true);
