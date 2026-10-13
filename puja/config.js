/* PujaQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API. */
window.SQ = {
  SUPABASE_URL: "https://xucggjcdbgcxqhdhztes.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

  APP: "puja",
  TABLE: "puja_bookings",
  APP_NAME: "PujaQ",
  SHOP_NAME: "Pandit Sharma Ji",
  SHOP_SUB: "Pandit bookings",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  STATUS_LABELS: { booked: "Booked", done: "Done", cancelled: "Cancelled", no_show: "No-show" },
  PUJA_TYPES: ["Griha Pravesh", "Wedding", "Satyanarayan Katha", "Havan", "Mundan"],
  TIME_SLOTS: ["09:00", "11:00", "13:00", "16:00", "18:00"],
};
