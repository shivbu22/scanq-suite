/* CampQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoRegs() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, date, checked_in, m) => ({
    id, patient_name: name, phone,
    camp_date: date, checked_in,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-r1", "Meera Iyer", "", today, true, 300),
    mk("demo-r2", "Dev Patel", "98220 44510", today, true, 240),
    mk("demo-r3", "Priya Nair", "", today, false, 180),
    mk("demo-r4", "Aarav Mehta", "98110 22334", today, false, 120),
    mk("demo-r5", "Sana Sheikh", "", today, false, 90),
    mk("demo-r6", "Rohit Kumar", "98901 77882", tomorrow, false, 45),
    mk("demo-r7", "Kavya Reddy", "", tomorrow, false, 30),
    mk("demo-r8", "Arjun Singh", "98110 55667", dayISO(3), false, 20),
  ];
}
