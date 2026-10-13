-- ScanQ Suite — shared Supabase schema for 7 micro-apps.
-- One project, prefixed tables per app. Run once in the SQL Editor.

-- ============ queue tables (clinic, salon, kirana, tailor, service) ============
DO $$
DECLARE
  app text;
  tbl text;
BEGIN
  FOREACH app IN ARRAY ARRAY['clinic', 'salon', 'kirana', 'tailor', 'service'] LOOP
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
  END LOOP;
END $$;

-- one token function for all queue apps (advisory lock per app, race-safe)
CREATE OR REPLACE FUNCTION next_queue_token(p_app text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('queue_token_' || p_app));
  EXECUTE format(
    'SELECT COALESCE(MAX(token), 0) + 1 FROM %I WHERE created_at::date = CURRENT_DATE',
    p_app || '_queue'
  ) INTO t;
  RETURN t;
END $$;
GRANT EXECUTE ON FUNCTION next_queue_token(text) TO anon;

-- ============ MessCount: daily meal RSVPs ============
CREATE TABLE IF NOT EXISTS mess_rsvp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  meal text NOT NULL CHECK (meal IN ('lunch', 'dinner')),
  eating boolean NOT NULL DEFAULT true,
  rsvp_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mess_rsvp_date ON mess_rsvp (rsvp_date, meal);
ALTER TABLE mess_rsvp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_mess_rsvp ON mess_rsvp;
DROP POLICY IF EXISTS anon_insert_mess_rsvp ON mess_rsvp;
CREATE POLICY anon_read_mess_rsvp ON mess_rsvp FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_mess_rsvp ON mess_rsvp FOR INSERT TO anon WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE mess_rsvp;

-- ============ FeedbackQ: ratings inbox ============
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category text NOT NULL DEFAULT 'general',
  comment text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'acknowledged', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback (status, created_at);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_feedback ON feedback;
DROP POLICY IF EXISTS anon_insert_feedback ON feedback;
DROP POLICY IF EXISTS anon_update_feedback ON feedback;
CREATE POLICY anon_read_feedback ON feedback FOR SELECT TO anon USING (true);
CREATE POLICY anon_insert_feedback ON feedback FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_feedback ON feedback FOR UPDATE TO anon USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE feedback;

-- ============ shared storage (ServiceQ device photos) ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon insert documents" ON storage.objects;
DROP POLICY IF EXISTS "anon read documents" ON storage.objects;
CREATE POLICY "anon insert documents" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'documents');
CREATE POLICY "anon read documents" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'documents');

-- ============ updated_at trigger for queue tables ============
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$
DECLARE app text;
BEGIN
  FOREACH app IN ARRAY ARRAY['clinic', 'salon', 'kirana', 'tailor', 'service'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch ON %I', app || '_queue');
    EXECUTE format('CREATE TRIGGER trg_touch BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', app || '_queue');
  END LOOP;
END $$;
