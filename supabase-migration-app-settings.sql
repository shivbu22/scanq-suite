-- ============ app settings (per-app admin passcode hash) ============
-- The dashboard passcode is changeable from the admin UI; the sha256 hash
-- is stored here (same "speed bump, not real security" model as config.js).
CREATE TABLE IF NOT EXISTS app_settings (
  app text PRIMARY KEY,
  passcode_hash text NOT NULL
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read app_settings" ON app_settings;
CREATE POLICY "anon read app_settings" ON app_settings
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "anon update app_settings" ON app_settings;
CREATE POLICY "anon update app_settings" ON app_settings
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- default passcode 1234 (sha256) for every app; change from any dashboard
INSERT INTO app_settings (app, passcode_hash) VALUES
  ('clinic',   '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('salon',    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('kirana',   '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('mess',     '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('tailor',   '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('service',  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'),
  ('feedback', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')
ON CONFLICT (app) DO NOTHING;
