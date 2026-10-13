# ScanQ Suite — 83 free counter tools for local businesses

A customer scans a QR code at the counter, does everything from their phone
browser, and the shop owner runs the counter from a live dashboard.
No app to install. No cost to run (Supabase + Vercel free tiers).

**Live:** <https://scanq-suite.vercel.app> — pick any app, scan, try it.

## How it works

Three screens, one system:

1. **Customer page** (`/<app>/`) — opened by scanning the counter QR.
   Take a token, place an order, book a slot, upload a document, check in.
   Works in any phone browser, nothing to install.
2. **Owner dashboard** (`/<app>/admin.html`) — passcode-gated. See the live
   queue, call the next token, mark orders ready, change the passcode.
   Updates arrive in realtime — no refresh needed.
3. **Counter TV board** (`/<app>/admin.html?display=1`) — big "Now serving"
   display for a TV or tablet at the counter.

## How to use (shop owner)

1. Open your app's customer page and print its QR code — ready-made codes
   are in [`qr/`](qr/) (`qr/index.html` is a printable sheet of all 83).
2. Stick the QR at your counter.
3. Customers scan → take token / order / book — it lands on your dashboard.
4. Open `admin.html` on your phone (default passcode `1234` — **change it**
   in the dashboard settings on first use).
5. Optional: open `admin.html?display=1` on a counter TV for "Now serving".

## What you get (results)

- **83 working apps** across clinics, salons, food stalls, shops, services,
  bookings and business tools (full list below) — each with customer page,
  owner dashboard and TV display.
- **Live realtime backend** — one Supabase project, all 83 apps wired,
  queue tokens, bookings, uploads and dashboards verified end-to-end.
- **Printable QR codes** for every app in [`qr/`](qr/).
- **Offline demo mode** — every app runs with `?demo=1` and sample data,
  no account needed.

## Requirements

- A **Supabase** project (free tier is enough). The backend is plain
  Postgres + Realtime + Storage — no custom server code.
- A static host (**Vercel**, Netlify, Cloudflare Pages — free tiers fine).
- That's it. The frontend is vanilla HTML/CSS/JS; no build step, no npm.

## Setup

1. **Database** — in the Supabase SQL editor, run these files in order from
   this repo:
   - `supabase-migration-app-settings.sql`
   - `supabase-migration-batch2.sql`
   - `supabase-migration-remaining.sql` (batches 3–5, idempotent re-run)
   
   This creates all app tables, the shared `next_queue_token(app)` function,
   RLS policies, realtime publication and the `documents` storage bucket.
   Expect a "potential issues detected" prompt (the script replaces policies)
   — confirm and run.
2. **Config** — in each app's `config.js`, set your Supabase project URL and
   anon key (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
3. **Deploy** — point Vercel/Netlify at this folder. Landing page is
   `index.html`; each app lives in its own subdirectory (`/clinic/`, …).
4. **QR codes** — generate or reuse [`qr/`](qr/); each code points at
   `https://<your-domain>/<app>/`.

## Preview without any setup

```bash
cd scanq-suite && python3 -m http.server 8000
# http://localhost:8000/clinic/?demo=1
```

Demo mode runs fully offline with sample data — nothing is sent anywhere.

## The 83 apps

**Queues & tokens** — customers take a number and watch their turn live:

| App | For |
|---|---|
| ClinicQ | Clinics — OPD tokens, who's ahead |
| SalonQ | Salons — walk-in waitlist by service |
| BarberQ | Barbershops — chair queue |
| CyberQ | Print shops — print-job queue with document upload |
| ServiceQ | Repair shops — job cards with photo + live status |
| CarWashQ | Car washes — watch your car's stage go live |
| LaundryQ | Laundries — drop tracking with pickup codes |
| PhotoQ | Photo studios — print & album order tracking |
| TailorTrack | Tailors — cutting → stitching → ready |
| BloodQ | Blood donation camps — donor queue |
| LabQ | Pathology labs — sample collection tokens |
| DentalQ | Dental clinics — appointment queue |
| PhysioQ | Physiotherapy centres — session queue |
| VetQ | Veterinary clinics — pet OPD tokens |
| AyurvedaQ | Ayurvedic clinics — consultation queue |
| DarshanQ | Temples — darshan slot tokens |
| CampQ | Health/eye camps — registration queue |
| MuseumQ | Museums — entry queue |
| PujaQ | Puja services — booking queue |

**Food & kitchen** — order from the table, kitchen gets live tickets:

| App | For |
|---|---|
| MenuQ | Restaurants — table ordering from phones |
| BakeryQ | Bakeries — order queue |
| ChaatQ | Chaat stalls — token-based ordering |
| ChaiQ | Tea stalls — quick order queue |
| CanteenQ | Canteens — meal token queue |
| MessCount | Tiffin/mess owners — daily meal headcount |
| JuiceQ | Juice bars — order queue |
| MithaiQ | Sweet shops — order queue |
| FruitQ | Fruit vendors — order queue |
| MeatQ | Meat shops — order queue |
| SabziQ | Vegetable vendors — order queue |
| MandiQ | Mandi stalls — order queue |
| CateringQ | Caterers — event order management |
| BanquetQ | Banquet halls — booking & event queue |
| DairyQ | Milk vendors — subscriptions, daily quantity, monthly bill |

**Bookings & slots** — bookable time slots, check-ins, attendance:

| App | For |
|---|---|
| SlotQ | Consultants — bookable slots, no-show tracking |
| TurfQ | Sports turfs — ground booking slots |
| CoachQ | Coaches — session bookings |
| PlayQ | Play zones — entry slots |
| SwimQ | Swimming pools — batch bookings |
| DanceQ | Dance studios — class bookings |
| YogaQ | Yoga centres — batch bookings |
| StudioQ | Studios (music/photo) — slot bookings |
| DJQ | DJs — event bookings |
| GamingQ | Gaming zones — station bookings |
| SpaQ | Spas — appointment bookings |
| MakeupQ | Makeup artists — appointment bookings |
| MehndiQ | Mehndi artists — appointment bookings |
| NailQ | Nail studios — appointment bookings |
| TattooQ | Tattoo studios — appointment bookings |
| GymQ | Gyms — QR check-in, attendance, fee watch |

**Shops & retail** — order lists, packing queues:

| App | For |
|---|---|
| KiranaQ | Kirana stores — customer order lists, packing queue |
| PharmaQ | Pharmacies — medicine order queue, refills |
| BooksQ | Bookstores — order & availability queue |
| FlowerQ | Florists — order queue |
| GiftQ | Gift shops — order queue |
| PlantQ | Nurseries — order queue |
| ShoeQ | Shoe stores — size-wise order queue |
| WatchQ | Watch shops — order/service queue |
| OpticsQ | Opticians — order & fitting queue |
| BoutiqueQ | Boutiques — order tracking |

**Local services** — job cards and service queues:

| App | For |
|---|---|
| PackersQ | Packers & movers — job bookings |
| CourierQ | Courier points — parcel queue |
| MechanicQ | Garages — repair job cards |
| ValetQ | Valet parking — car tokens |
| ParkingQ | Parking lots — slot tokens |
| WaterQ | Water suppliers — delivery queue |
| GasQ | Gas agencies — cylinder booking queue |
| TentQ | Tent houses — event equipment bookings |

**Stay & community** — residents, members, visitors:

| App | For |
|---|---|
| HostelQ | Hostels/PGs — room & complaint queue |
| DaycareQ | Daycares — check-in/out log |
| CoWorkQ | Coworking spaces — desk booking |
| LibraryQ | Libraries — book issue queue |
| SocietyQ | Housing societies — visitor & maintenance log |

**Business tools** — run the shop itself:

| App | For |
|---|---|
| FeedbackQ | Any shop — QR feedback box to the owner's screen |
| ReviewQ | Any shop — collect Google-style reviews |
| LoyaltyQ | Any shop — stamp-based loyalty cards |
| HajiriQ | Contractors — worker attendance register |
| KaamQ | Job seekers — gig/job listings board |
| HireQ | Small businesses — hiring & applicant tracker |
| RecordQ | Any shop — daily sales/expense records |
| EventQ | Events — RSVP headcount + entry check-in |
| FlexQ | Print shops — flex/banner order tracking |
| TuitionQ | Tutors — batch & fee tracking |

## How it's built

- **Frontend:** vanilla HTML/CSS/JS. Shared design system in `shared/`
  (`styles.css`, `sq.js`, self-hosted Space Grotesk). Each app adds a tiny
  `theme.css` with its brand colours. One Supabase JS client (pinned
  `@2.44.4`), loaded from CDN.
- **Backend:** one Supabase project — prefixed tables per app
  (`<app>_queue`, `<app>_orders`, …), a shared `next_queue_token(app)`
  function for race-safe token numbering, RLS policies, realtime, and a
  `documents` storage bucket for uploads.
- **Config:** each app's `config.js` holds `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `APP_NAME` and `PASSCODE_HASH` (sha256 of the
  dashboard passcode).

## Security notes

Be honest about what this is:

- The dashboard passcode is a **browser-side speed bump**, not real
  authorization — anyone with the anon key can read the tables.
- The default RLS policies allow anonymous read/write on queue tables by
  design (customers need to join without accounts). Don't store sensitive
  personal or medical data.
- For production use with real customer data, add **Supabase Auth** and
  owner-scoped RLS policies.

## Project structure

```
scanq-suite/
├── index.html          # landing page — all 83 apps
├── shared/             # design system: sq.js, styles.css, fonts
├── <app>/              # one folder per app: index.html, admin.html,
│                       # config.js, app.js, theme.css
├── qr/                 # printable QR codes for all 83 apps
│   └── index.html      # printable QR sheet
├── supabase-migration-*.sql   # backend schema (run in order)
└── README.md
```

Built for India's local businesses — free forever, no commissions, no lock-in.
