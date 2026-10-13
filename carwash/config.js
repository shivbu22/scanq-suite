/* CarWashQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API. */
window.SQ = {
  SUPABASE_URL: "https://xucggjcdbgcxqhdhztes.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

  APP: "carwash",
  TABLE: "carwash_queue",
  APP_NAME: "CarWashQ",
  SHOP_NAME: "Sparkle Car Wash",
  SHOP_SUB: "Car wash queue",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  STATUS_LABELS: { queued: "Waiting", active: "Washing", done: "Done" },
  PACKAGES: ["Foam Wash", "Interior + Exterior", "Full Detailing"],
};
