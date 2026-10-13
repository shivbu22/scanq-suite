/* MessCount — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API.
   Table: mess_rsvp (name, meal "lunch"|"dinner", eating bool,
   rsvp_date, created_at). No token function needed. */
window.SQ = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

  APP: "mess",
  TABLE: "mess_rsvp",
  APP_NAME: "MessCount",
  SHOP_NAME: "Annapurna Mess",
  SHOP_SUB: "Daily meal headcount",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
};
