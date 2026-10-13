# ScanQ Suite — seven free counter tools for local businesses

A customer scans a QR code at the counter, does everything from their phone
browser, and the shop owner runs the counter from a live dashboard.
No app to install. No cost to run (Supabase + Vercel free tiers).

**Live:** <https://scanq-suite.vercel.app> *(deploy after pushing)*

## The apps

| App | For | What it does |
|---|---|---|
| [ClinicQ](clinic/) | Clinics | OPD tokens — patients take a number, see who's ahead |
| [SalonQ](salon/) | Salons | Walk-in waitlist — pick a service, get a token, watch your turn |
| [KiranaQ](kirana/) | Kirana / grocery stores | Order lists — customers tick items, shop gets a packing queue |
| [MessCount](mess/) | Tiffin / mess owners | Daily meal headcount — know before you cook |
| [TailorTrack](tailor/) | Tailors | Order tracking — cutting → stitching → ready, live for the customer |
| [ServiceQ](service/) | Repair shops | Job cards — photo + issue in, live repair status out |
| [FeedbackQ](feedback/) | Any shop | QR feedback box — ratings land straight on the owner's screen |

Each app has a customer page (`index.html`), an owner dashboard (`admin.html`,
passcode-gated), and a counter TV board (`admin.html?display=1`, queue apps).

## How it's built

- **Frontend:** vanilla HTML/CSS/JS. Shared design system in `shared/`
  (`styles.css`, `sq.js`, self-hosted Space Grotesk). Each app adds a tiny
  `theme.css` with its brand colours.
- **Backend:** one Supabase project for the whole suite —
  `supabase-schema.sql` creates the prefixed tables (`clinic_queue`,
  `salon_queue`, `kirana_queue`, `tailor_queue`, `service_queue`,
  `mess_rsvp`, `feedback`), a shared `next_queue_token(app)` function,
  RLS policies, realtime, and a `documents` storage bucket.
- **Config:** copy your project URL + anon key into each app's `config.js`
  (replace the `YOUR-PROJECT` / `YOUR-ANON-KEY` placeholders).
  Default dashboard passcode is `1234` — change `PASSCODE_HASH` (sha256).

## Preview without any setup

Serve the folder over HTTP and open any app with `?demo=1`:

```bash
cd scanq-suite && python3 -m http.server 8000
# http://localhost:8000/clinic/?demo=1
```

Demo mode runs fully offline with sample data — nothing is sent anywhere.

## Deploy

Static hosting is all it needs. Point Vercel/Netlify/Cloudflare Pages at this
folder; the landing page is `index.html` and each app lives in its own
subdirectory (`/clinic/`, `/salon/`, …). Generate a QR per app pointing at its
URL for the counter.
