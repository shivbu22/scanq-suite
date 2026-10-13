-- ScanQ Suite — batch 2: 10 new micro-apps (MenuQ, CarWashQ, LaundryQ, GymQ,
-- PharmaQ, EventQ, PhotoQ, DairyQ, CyberQ, SlotQ). Idempotent; run once.

-- ============ queue tables (carwash, laundry, pharma, photo, cyber, menu) ============
-- Same shape + standard statuses as batch 1; per-app labels live in config.js.
-- next_queue_token(p_app) works unchanged: table = p_app || '_queue'.
DO $$
DECLARE
  app text;
  tbl text;
BEGIN
  FOREACH app IN ARRAY ARRAY['carwash', 'laundry', 'pharma', 'photo', 'cyber', 'menu'] LOOP
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

-- ============ GymQ: members + check-ins ============
CREATE TABLE IF NOT EXISTS gym_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  plan text,
  fee_due date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gym_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES gym_members(id) ON DELETE SET NULL,
  member_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gym_checkins_created ON gym_checkins (created_at DESC);

-- ============ EventQ: RSVPs + gate check-in ============
CREATE TABLE IF NOT EXISTS event_rsvp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL DEFAULT 'Event',
  guest_name text NOT NULL,
  phone text,
  headcount integer NOT NULL DEFAULT 1,
  checked_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_created ON event_rsvp (created_at DESC);

-- ============ DairyQ: subscriptions + daily logs ============
CREATE TABLE IF NOT EXISTS dairy_subs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text,
  daily_qty numeric NOT NULL DEFAULT 1,
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dairy_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id uuid REFERENCES dairy_subs(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  qty numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sub_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_dairy_logs_date ON dairy_logs (log_date);

-- ============ SlotQ: bookable time slots ============
CREATE TABLE IF NOT EXISTS slot_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  phone text,
  slot_date date NOT NULL,
  slot_time text NOT NULL,
  service text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','done','cancelled','no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slot_bookings_date ON slot_bookings (slot_date, slot_time);

-- ============ RLS + realtime for the non-queue tables ============
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['gym_members','gym_checkins','event_rsvp','dairy_subs','dairy_logs','slot_bookings'] LOOP
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
  ('menu',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('carwash', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('laundry', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('gym',     '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('pharma',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('event',   '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('photo',   '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('dairy',   '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('cyber',   '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('slot',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
ON CONFLICT (app) DO NOTHING;
