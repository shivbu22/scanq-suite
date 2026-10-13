/* FeedbackQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API.
   Table `feedback` needs: id uuid PK, rating int, category text,
   comment text, name text nullable, status text default 'new',
   created_at timestamptz default now(). RLS: allow anonymous
   INSERT and SELECT (mirror the queue_items policies). */
window.SQ = {
  SUPABASE_URL: "https://xucggjcdbgcxqhdhztes.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Y2dnamNkYmdjeHFoZGh6dGVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Mzc2OTIsImV4cCI6MjEwNzQxMzY5Mn0.iRvmx3gTufowzEDLAjiT3cla95zP8geJwDaOuzzjUCw",

  APP: "feedback",
  TABLE: "feedback",
  APP_NAME: "FeedbackQ",
  SHOP_NAME: "Sharma Stationery",
  SHOP_SUB: "Customer feedback box",

  CATEGORIES: ["Service", "Quality", "Staff", "Cleanliness", "Price", "Other"],

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",
};
