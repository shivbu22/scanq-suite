/* ServiceQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API.
   The service_queue table + next_queue_token(p_app) rpc must exist. */
window.SQ = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

  APP: "service",
  TABLE: "service_queue",
  APP_NAME: "ServiceQ",
  SHOP_NAME: "FixPoint Mobiles",
  SHOP_SUB: "Repair job tracker",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  STATUS_LABELS: { queued: "Received", active: "Repairing", done: "Ready" },
};
