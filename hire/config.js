/* HireQ — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API. */
window.SQ = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

  APP: "hire",
  TABLE: "hire_applications",
  APP_NAME: "HireQ",
  SHOP_NAME: "My Shop",
  SHOP_SUB: "Job applications",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security.) */
  PASSCODE_HASH:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  STATUS_LABELS: { new: "New", shortlisted: "Shortlisted", rejected: "Rejected" },

  /* Open roles are managed per device on the dashboard and stored in
     localStorage under "hireq_roles"; these are the first-run defaults. */
  DEFAULT_ROLES: ["Helper", "Delivery Boy", "Cashier", "Tailor"],
};
