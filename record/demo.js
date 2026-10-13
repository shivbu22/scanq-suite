/* RecordQ — demo seed data, shared by the patient page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const RX_SVG = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520" viewBox="0 0 400 520">
   <rect width="400" height="520" fill="#ffffff"/>
   <rect width="400" height="72" fill="#0f766e"/>
   <text x="24" y="45" font-family="sans-serif" font-size="22" fill="#ffffff" font-weight="bold">City Care Clinic</text>
   <text x="24" y="110" font-family="sans-serif" font-size="26" fill="#115e59" font-weight="bold">Rx</text>
   <text x="24" y="150" font-family="sans-serif" font-size="15" fill="#333">Tab. Paracetamol 650 — 1 tab twice daily, 3 days</text>
   <text x="24" y="180" font-family="sans-serif" font-size="15" fill="#333">Syr. Cetirizine — 10ml at bedtime, 5 days</text>
   <text x="24" y="210" font-family="sans-serif" font-size="15" fill="#333">Tab. Vitamin C — 1 tab daily, 10 days</text>
   <text x="24" y="260" font-family="sans-serif" font-size="13" fill="#777">Drink plenty of fluids. Review after 5 days.</text>
   <text x="24" y="490" font-family="sans-serif" font-size="13" fill="#0f766e">Dr. A. Sharma, MBBS</text>
   </svg>`
);

export function demoRows() {
  const now = Date.now();
  const iso = (d) => new Date(now - d * 86400000).toISOString().slice(0, 10);
  const ago = (m) => new Date(now - m * 60000).toISOString();
  let n = 0;
  const mk = (name, phone, daysAgo, notes, rx, m) => ({
    id: "demo-r" + (++n),
    patient_name: name, phone,
    visit_date: iso(daysAgo),
    notes: notes || null,
    prescription_url: rx ? RX_SVG : null,
    created_at: ago(m),
  });
  return [
    // Patient 1 — three visits, latest today, one with a prescription photo
    mk("Meera Iyer", "98220 44510", 0,
      "Fever 101°F, sore throat. Advised rest and fluids. Review in 5 days if fever persists.", true, 35),
    mk("Meera Iyer", "98220 44510", 21,
      "Follow-up: blood pressure 130/85. Continue medication, low-salt diet advised.", false, 21 * 1440),
    mk("Meera Iyer", "98220 44510", 45,
      "Routine check-up. All vitals normal.", false, 45 * 1440),
    // Patient 2 — two visits, one notes-only record
    mk("Aarav Mehta", "98110 22334", 0,
      "Sprained ankle (left). Ice pack + crepe bandage. Avoid weight for 2 days.", true, 90),
    mk("Aarav Mehta", "98110 22334", 12,
      null, false, 12 * 1440), // notes-only record
    // Patient 3 — two visits
    mk("Sana Sheikh", "98901 77882", 3,
      "Migraine episode. Prescribed as needed. Trigger diary suggested.", true, 3 * 1440),
    mk("Sana Sheikh", "98901 77882", 30,
      "First visit: general consultation. Vitamin D deficiency suspected, blood test advised.", false, 30 * 1440),
  ];
}
