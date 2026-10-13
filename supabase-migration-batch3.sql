-- ScanQ Suite — batch 3: 10 new micro-apps (TurfQ, LabQ, DarshanQ, SabziQ,
-- MithaiQ, LibraryQ, SocietyQ, VetQ, MehndiQ, FlexQ). Idempotent; run once.

-- ============ queue tables (lab, darshan, sabzi, mithai, flex) ============
-- Same shape + standard statuses as batches 1-2; per-app labels in config.js.
-- next_queue_token(p_app) works unchanged: table = p_app || '_queue'.
DO $$
DECLARE
  app text;
  tbl text;
BEGIN
  FOREACH app IN ARRAY ARRAY['lab', 'darshan', 'sabzi', 'mithai', 'flex'] LOOP
    tbl := app || '_queue';
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token integer NOT NULL,
        customer_name text NOT NULL,
        phone text,
        status text NOT NULL DEFAULT ''queued''
          CHECK (status IN (''queued'',''active'',''done'',''cancelled'')),
        details jsonb NOT NULL DEFAULT ''{}''::jsonb,
        file_url text,
        note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        called_at timestamptz,
        done_at timestamptz
      )', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (created_at DESC)',
                   'idx_' || tbl || '_created', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (status, created_at)',
                   'idx_' || tbl || '_status', tbl);
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
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch ON %I', tbl);
    EXECUTE format('CREATE TRIGGER trg_touch BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', tbl);
  END LOOP;
END $$;

-- ============ TurfQ: turf slot bookings ============
CREATE TABLE IF NOT EXISTS turf_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text,
  slot_date date NOT NULL,
  slot_time text NOT NULL,
  turf_name text NOT NULL DEFAULT 'Turf A',
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_turf_slots_date ON turf_slots (slot_date, slot_time);

-- ============ LibraryQ: book loans ============
CREATE TABLE IF NOT EXISTS library_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name text NOT NULL,
  phone text,
  book_title text NOT NULL,
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT (CURRENT_DATE + 14),
  returned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_library_loans_due ON library_loans (due_date) WHERE NOT returned;

-- ============ SocietyQ: dues + complaints + visitors ============
CREATE TABLE IF NOT EXISTS society_dues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_no text NOT NULL,
  resident_name text NOT NULL,
  amount numeric NOT NULL,
  month text NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS society_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_no text NOT NULL,
  resident_name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS society_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name text NOT NULL,
  flat_no text NOT NULL,
  purpose text,
  check_in timestamptz NOT NULL DEFAULT now(),
  check_out timestamptz
);
CREATE INDEX IF NOT EXISTS idx_society_visitors_in ON society_visitors (check_in DESC);

-- ============ VetQ: vet appointments ============
CREATE TABLE IF NOT EXISTS vet_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_name text NOT NULL,
  owner_name text NOT NULL,
  phone text,
  visit_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vet_visits_date ON vet_visits (visit_date);

-- ============ MehndiQ: mehndi bookings ============
CREATE TABLE IF NOT EXISTS mehndi_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text,
  booking_date date NOT NULL,
  slot_time text NOT NULL,
  design text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mehndi_bookings_date ON mehndi_bookings (booking_date, slot_time);

-- ============ RLS + realtime for the non-queue tables ============
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['turf_slots','library_loans','society_dues','society_complaints','society_visitors','vet_visits','mehndi_bookings'] LOOP
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

-- ============ passcode hashes for the new apps ============
INSERT INTO app_settings (app, passcode_hash) VALUES
  ('turf',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('lab',     '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('darshan', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('sabzi',   '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('mithai',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('library', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('society', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('vet',     '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('mehndi',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('flex',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
ON CONFLICT (app) DO NOTHING;
