-- ScanQ Suite batch 5 — HajiriQ, LoyaltyQ, ReviewQ, HireQ, KaamQ, RecordQ.
-- Run in the Supabase SQL Editor after batches 1-4. Safe to re-run.

-- ============ HajiriQ: staff roster + daily attendance ============
CREATE TABLE IF NOT EXISTS hajiri_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  daily_wage numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hajiri_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES hajiri_staff(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  check_in timestamptz,
  check_out timestamptz,
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present','absent','half','leave')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_hajiri_attendance_date ON hajiri_attendance (work_date, status);

-- ============ LoyaltyQ: stamp cards ============
CREATE TABLE IF NOT EXISTS loyalty_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  stamps int NOT NULL DEFAULT 0,
  rewards_earned int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS loyalty_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES loyalty_members(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('stamp','redeem')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_events_member ON loyalty_events (member_id, created_at DESC);

-- ============ ReviewQ: review taps ============
CREATE TABLE IF NOT EXISTS review_taps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stars int CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_taps_created ON review_taps (created_at DESC);

-- ============ HireQ: job applications ============
CREATE TABLE IF NOT EXISTS hire_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  role text NOT NULL,
  experience text,
  note text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','shortlisted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hire_applications_status ON hire_applications (status, created_at DESC);

-- ============ KaamQ: technician jobs ============
CREATE TABLE IF NOT EXISTS kaam_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text NOT NULL,
  service text NOT NULL,
  address text,
  preferred_time text,
  technician text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','assigned','arrived','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kaam_jobs_status ON kaam_jobs (status, created_at DESC);

-- ============ RecordQ: clinic patient visits ============
CREATE TABLE IF NOT EXISTS clinic_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL,
  phone text NOT NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  prescription_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinic_records_phone ON clinic_records (phone, visit_date DESC);

-- ============ RLS + realtime for all batch-5 tables ============
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'hajiri_staff','hajiri_attendance',
    'loyalty_members','loyalty_events',
    'review_taps','hire_applications','kaam_jobs','clinic_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_read_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_insert_' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'anon_update_' || tbl, tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon USING (true)',
                   'anon_read_' || tbl, tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO anon WITH CHECK (true)',
                   'anon_insert_' || tbl, tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO anon USING (true) WITH CHECK (true)',
                   'anon_update_' || tbl, tbl);
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
  END LOOP;
END $$;

-- ============ app_settings seeds (default passcode 1234 sha256) ============
INSERT INTO app_settings (app, passcode_hash) VALUES
  ('hajiri',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('loyalty', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('review',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('hire',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('kaam',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('record',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
ON CONFLICT (app) DO NOTHING;
