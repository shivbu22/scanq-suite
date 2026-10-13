/* VetQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoVisits() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, pet, owner, phone, date, reason, status, m) => ({
    id, pet_name: pet, owner_name: owner, phone,
    visit_date: date, reason, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-v1", "Bruno", "Aarav Mehta", "98110 22334", today, "Vaccination", "done", 300),
    mk("demo-v2", "Mili", "Sana Sheikh", "", today, "Checkup", "done", 240),
    mk("demo-v3", "Tommy", "Dev Patel", "98220 44510", today, "Grooming", "no_show", 180),
    mk("demo-v4", "Coco", "Priya Nair", "", today, "Checkup", "booked", 120),
    mk("demo-v5", "Sheru", "Rohit Kumar", "98901 77882", today, "Vaccination", "booked", 60),
    mk("demo-v6", "Luna", "Meera Iyer", "", tomorrow, "Emergency", "booked", 30),
    mk("demo-v7", "Rocky", "Arjun Singh", "98110 55667", tomorrow, "Checkup", "booked", 20),
  ];
}
