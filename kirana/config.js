/* KiranaQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API.
   Table: kirana_queue (token, customer_name,
   phone, details jsonb {items:[...]}, status, created_at). */
window.SQ = {
  SUPABASE_URL: "https://xucggjcdbgcxqhdhztes.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Y2dnamNkYmdjeHFoZGh6dGVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Mzc2OTIsImV4cCI6MjEwNzQxMzY5Mn0.iRvmx3gTufowzEDLAjiT3cla95zP8geJwDaOuzzjUCw",

  APP: "kirana",
  TABLE: "kirana_queue",
  APP_NAME: "KiranaQ",
  SHOP_NAME: "Fresh Daily Store",
  SHOP_SUB: "Grocery order queue",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  STATUS_LABELS: { queued: "Queued", active: "Packing", done: "Ready", cancelled: "Cancelled" },

  ITEMS: [
    "Atta 5kg", "Rice 5kg", "Sugar 1kg", "Mustard Oil 1L",
    "Toor Dal 1kg", "Milk 1L", "Eggs (12)", "Bread",
    "Tea 250g", "Biscuits", "Salt 1kg", "Detergent 1kg",
  ],
};
