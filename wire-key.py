#!/usr/bin/env python3
"""Wire the Supabase anon key into all 17 ScanQ Suite app configs.

Usage:
    python3 wire-key.py <anon-key>
    python3 wire-key.py eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

What it does:
  - Replaces SUPABASE_ANON_KEY "YOUR-ANON-KEY" with the real key in every
    <app>/config.js (all 17 apps).
  - Fixes the batch-1 configs that still point at "https://YOUR-PROJECT.supabase.co"
    to the real project URL https://xucggjcdbgcxqhdhztes.supabase.co.
  - Refuses to run unless the key looks like a Supabase anon JWT (starts with eyJ
    and has 3 dot-separated parts) and every config still has the placeholder.
  - Prints a per-app report. Idempotent: re-running with the same key is a no-op.

After this: redeploy (Vercel auto-deploys from GitHub push), then run the real
end-to-end test (submit a token on a customer page, watch it appear on admin).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REAL_URL = "https://xucggjcdbgcxqhdhztes.supabase.co"
APPS = [
    "clinic", "salon", "kirana", "mess", "tailor", "service", "feedback",
    "menu", "carwash", "laundry", "gym", "pharma", "event", "photo",
    "dairy", "cyber", "slot",
]

KEY_RE = re.compile(r'SUPABASE_ANON_KEY:\s*"YOUR-ANON-KEY"')
URL_RE = re.compile(r'SUPABASE_URL:\s*"https://YOUR-PROJECT\.supabase\.co"')


def looks_like_jwt(key: str) -> bool:
    parts = key.strip().split(".")
    return key.strip().startswith("eyJ") and len(parts) == 3 and all(parts)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[0])
        print("Usage: python3 wire-key.py <anon-key>")
        return 2
    key = sys.argv[1].strip()
    if not looks_like_jwt(key):
        print("Refusing: key does not look like a Supabase anon JWT "
              "(expected eyJ... with 3 dot-separated parts).")
        return 1

    changed, already, missing = [], [], []
    for app in APPS:
        cfg = ROOT / app / "config.js"
        if not cfg.exists():
            missing.append(app)
            continue
        text = cfg.read_text()
        new = KEY_RE.sub(f'SUPABASE_ANON_KEY: "{key}"', text)
        new = URL_RE.sub(f'SUPABASE_URL: "{REAL_URL}"', new)
        if new == text:
            already.append(app)  # key already wired (or placeholder gone)
        else:
            cfg.write_text(new)
            changed.append(app)

    print(f"Project URL : {REAL_URL}")
    print(f"Wired ({len(changed)}): {', '.join(changed) or '—'}")
    print(f"Already wired ({len(already)}): {', '.join(already) or '—'}")
    if missing:
        print(f"MISSING config.js ({len(missing)}): {', '.join(missing)}")
        return 1

    # Final sanity: no placeholder may remain.
    leftovers = [a for a in APPS
                 if "YOUR-ANON-KEY" in (ROOT / a / "config.js").read_text()
                 or "YOUR-PROJECT" in (ROOT / a / "config.js").read_text()]
    if leftovers:
        print(f"WARNING: placeholders remain in: {', '.join(leftovers)}")
        return 1
    print("All 17 configs wired. Next: push + redeploy, then real e2e test.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
