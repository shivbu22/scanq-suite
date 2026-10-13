/* SalonQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API. */
window.SQ = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

  APP: "salon",
  TABLE: "salon_queue",
  APP_NAME: "SalonQ",
  SHOP_NAME: "Glamour Salon",
  SHOP_SUB: "Walk-in waitlist",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  STATUS_LABELS: { queued: "Waiting", active: "In chair", done: "Done" },
  SERVICES: ["Haircut", "Shave & Beard Trim", "Facial", "Hair Colour", "Head Massage"],
};
