/* PhysioQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world.
   NOTE: `condition` is a demo/display field only — the real physio_sessions
   table has no condition column (flagged to parent). */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoSessions() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, date, condition, total, done, status, m) => ({
    id, patient_name: name, phone,
    session_date: date, condition,
    package_total: total, sessions_done: done, status,
    created_at: ago(m),
  });
  const today = dayISO(0);
  return [
    mk("demo-s1", "Meera Iyer", "", today, "Back pain", 10, 10, "done", 4320),
    mk("demo-s2", "Dev Patel", "98220 44510", today, "Knee", 5, 3, "booked", 300),
    mk("demo-s3", "Priya Nair", "", today, "Shoulder", 10, 6, "booked", 240),
    mk("demo-s4", "Aarav Mehta", "98110 22334", today, "Posture", 5, 1, "booked", 120),
    mk("demo-s5", "Sana Sheikh", "", today, "Back pain", 5, 0, "booked", 60),
    mk("demo-s6", "Rohit Kumar", "98901 77882", today, "Knee", 10, 0, "cancelled", 45),
  ];
}
