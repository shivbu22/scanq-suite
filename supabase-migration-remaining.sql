-- Combined batches 3+4+5 (idempotent, safe to re-run). Batches 1-2 already applied.

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

-- ScanQ Suite — batch 4: 50 new micro-apps. Idempotent; run once.
-- Queue apps (19): bakery, courier, flower, mechanic, optics, books, juice,
--   meat, fruit, chaat, barber, shoe, watch, canteen, gift, plant, boutique,
--   mandi, chai  →  <app>_queue, standard statuses, next_queue_token() works.
-- Booking/service apps (31): water, tuition, hostel, puja, gaming, spa, tattoo,
--   yoga, dance, daycare, dental, physio, ayurveda, nail, tent, catering,
--   banquet, makeup, valet, play, swim, dj, parking, museum, camp, blood,
--   cowork, studio, packers, gas, coach.

-- ============ queue tables ============
DO $$
DECLARE
  app text;
  tbl text;
BEGIN
  FOREACH app IN ARRAY ARRAY['bakery','courier','flower','mechanic','optics','books',
      'juice','meat','fruit','chaat','barber','shoe','watch','canteen','gift',
      'plant','boutique','mandi','chai'] LOOP
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

-- ============ WaterQ: can subscriptions + delivery log ============
CREATE TABLE IF NOT EXISTS water_subs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text,
  address text,
  cans_per_day integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS water_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id uuid NOT NULL REFERENCES water_subs(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  cans integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_water_logs_sub ON water_logs (sub_id, log_date DESC);

-- ============ TuitionQ: students + fees ============
CREATE TABLE IF NOT EXISTS tuition_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  phone text,
  class text,
  batch text,
  fee_due numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ HostelQ: dues + complaints ============
CREATE TABLE IF NOT EXISTS hostel_dues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no text NOT NULL,
  resident_name text NOT NULL,
  amount numeric NOT NULL,
  month text NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hostel_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_no text NOT NULL,
  resident_name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ appointment / booking tables ============
CREATE TABLE IF NOT EXISTS puja_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  booking_date date NOT NULL, slot_time text,
  puja_type text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gaming_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  slot_date date NOT NULL, slot_time text NOT NULL, pc_no text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gaming_slots_date ON gaming_slots (slot_date, slot_time);
CREATE TABLE IF NOT EXISTS spa_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  booking_date date NOT NULL, slot_time text, service text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tattoo_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  booking_date date NOT NULL, design_notes text, file_url text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS yoga_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name text NOT NULL, phone text,
  class_date date NOT NULL, class_time text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dance_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL, phone text,
  style text, batch text, fee_due numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daycare_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_name text NOT NULL, parent_name text, phone text,
  note text,
  check_in timestamptz NOT NULL DEFAULT now(),
  check_out timestamptz
);
CREATE TABLE IF NOT EXISTS dental_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL, phone text,
  visit_date date NOT NULL, treatment text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS physio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL, phone text,
  session_date date NOT NULL, package_total integer NOT NULL DEFAULT 1,
  sessions_done integer NOT NULL DEFAULT 0, condition text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ayurveda_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL, phone text,
  visit_date date NOT NULL, treatment text, followup_date date,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nail_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  booking_date date NOT NULL, slot_time text, design text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tent_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  event_date date NOT NULL, items text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catering_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  event_date date NOT NULL, guests integer, menu text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS banquet_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  event_date date NOT NULL, slot text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_banquet_date ON banquet_bookings (event_date, slot);
CREATE TABLE IF NOT EXISTS makeup_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  booking_date date NOT NULL, slot_time text, package text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS valet_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_no text NOT NULL, owner_name text, phone text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','parked','returned','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS play_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_name text NOT NULL, parent_phone text,
  check_in timestamptz NOT NULL DEFAULT now(),
  check_out timestamptz
);
CREATE TABLE IF NOT EXISTS swim_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name text NOT NULL, phone text,
  slot_date date NOT NULL, slot_time text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dj_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  event_date date NOT NULL, event_type text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS parking_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no text NOT NULL, phone text,
  check_in timestamptz NOT NULL DEFAULT now(),
  check_out timestamptz, amount numeric
);
CREATE TABLE IF NOT EXISTS museum_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name text NOT NULL, phone text,
  visit_date date NOT NULL, tickets integer NOT NULL DEFAULT 1,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS camp_regs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name text NOT NULL, phone text,
  camp_date date NOT NULL, checked_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS blood_donors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_name text NOT NULL, phone text,
  blood_group text, last_donation date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cowork_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_name text NOT NULL, phone text,
  booking_date date NOT NULL, desk_no text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS studio_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  slot_date date NOT NULL, slot_time text NOT NULL,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_studio_slots_date ON studio_slots (slot_date, slot_time);
CREATE TABLE IF NOT EXISTS packer_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  move_date date, from_city text, to_city text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','quoted','confirmed','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gas_refills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL, phone text,
  consumer_no text, booking_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','delivered','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coach_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL, phone text,
  sport text, batch text, fee_due numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS + realtime for the non-queue tables ============
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['water_subs','water_logs','tuition_students',
      'hostel_dues','hostel_complaints','puja_bookings','gaming_slots',
      'spa_bookings','tattoo_bookings','yoga_bookings','dance_students',
      'daycare_checkins','dental_visits','physio_sessions','ayurveda_visits',
      'nail_bookings','tent_bookings','catering_orders','banquet_bookings',
      'makeup_bookings','valet_requests','play_entries','swim_bookings',
      'dj_bookings','parking_tickets','museum_tickets','camp_regs',
      'blood_donors','cowork_bookings','studio_slots','packer_quotes',
      'gas_refills','coach_students'] LOOP
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

-- ============ passcode hashes for the 50 apps ============
INSERT INTO app_settings (app, passcode_hash) VALUES
  ('bakery','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('courier','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('water','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('tuition','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('mechanic','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('flower','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('puja','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('hostel','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('optics','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('gaming','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('books','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('spa','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('tattoo','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('yoga','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('dance','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('daycare','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('dental','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('physio','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('juice','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('meat','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('barber','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('tent','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('catering','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('banquet','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('makeup','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('valet','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('play','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('swim','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('gift','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('plant','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('fruit','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('chai','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('boutique','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('ayurveda','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('nail','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('coach','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('shoe','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('blood','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('chaat','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('gas','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('dj','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('parking','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('museum','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('camp','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('watch','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('canteen','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('cowork','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('studio','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('mandi','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('packers','03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
ON CONFLICT (app) DO NOTHING;

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
