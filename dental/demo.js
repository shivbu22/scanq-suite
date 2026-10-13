/* DentalQ — demo seed data, shared by the customer page and the dashboard
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
  const mk = (id, name, phone, date, treatment, status, m) => ({
    id, patient_name: name, phone,
    visit_date: date, treatment, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-v1", "Meera Iyer", "", today, "Cleaning", "done", 300),
    mk("demo-v2", "Dev Patel", "98220 44510", today, "Filling", "done", 240),
    mk("demo-v3", "Priya Nair", "", today, "Braces consult", "no_show", 180),
    mk("demo-v4", "Aarav Mehta", "98110 22334", today, "Root canal", "booked", 120),
    mk("demo-v5", "Sana Sheikh", "", today, "Cleaning", "booked", 90),
    mk("demo-v6", "Rohit Kumar", "98901 77882", today, "Extraction", "booked", 45),
    mk("demo-v7", "Kavya Reddy", "", tomorrow, "Filling", "booked", 30),
    mk("demo-v8", "Arjun Singh", "98110 55667", tomorrow, "Cleaning", "booked", 20),
  ];
}
