/* MuseumQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoTickets() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, date, tickets, used, m) => ({
    id, visitor_name: name, phone,
    visit_date: date, tickets, used,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-t1", "Meera Iyer", "", today, 2, true, 300),
    mk("demo-t2", "Dev Patel", "98220 44510", today, 4, true, 240),
    mk("demo-t3", "Priya Nair", "", today, 3, false, 180),
    mk("demo-t4", "Aarav Mehta", "98110 22334", today, 5, false, 120),
    mk("demo-t5", "Sana Sheikh", "", today, 2, false, 90),
    mk("demo-t6", "Rohit Kumar", "98901 77882", tomorrow, 6, false, 45),
    mk("demo-t7", "Kavya Reddy", "", tomorrow, 3, false, 30),
    mk("demo-t8", "Arjun Singh", "98110 55667", dayISO(3), 8, false, 20),
  ];
}
