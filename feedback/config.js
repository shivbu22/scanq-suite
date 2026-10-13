/* FeedbackQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API.
   Table `feedback` needs: id uuid PK, rating int, category text,
   comment text, name text nullable, status text default 'new',
   created_at timestamptz default now(). RLS: allow anonymous
   INSERT and SELECT (mirror the queue_items policies). */
window.SQ = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

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
