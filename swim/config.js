/* SwimQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API. */
window.SQ = {
  SUPABASE_URL: "https://xucggjcdbgcxqhdhztes.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

  APP: "swim",
  TABLE: "swim_bookings",
  APP_NAME: "SwimQ",
  SHOP_NAME: "BlueWave Pool",
  SHOP_SUB: "Lane booking",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  STATUS_LABELS: { booked: "Booked", done: "Done" },
  TIME_SLOTS: ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
               "16:00", "17:00", "18:00", "19:00", "20:00"],
};
