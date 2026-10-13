/* YogaQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoBookings() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, date, cls, status, m) => ({
    id, member_name: name, phone,
    class_date: date, class_time: cls, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-y1", "Meera Iyer", "", today, "Morning — 6 AM", "done", 400),
    mk("demo-y2", "Dev Patel", "98220 44510", today, "Morning — 6 AM", "done", 340),
    mk("demo-y3", "Priya Nair", "", today, "Evening — 6 PM", "no_show", 180),
    mk("demo-y4", "Aarav Mehta", "98110 22334", today, "Evening — 6 PM", "booked", 120),
    mk("demo-y5", "Sana Sheikh", "", today, "Evening — 6 PM", "booked", 90),
    mk("demo-y6", "Rohit Kumar", "98901 77882", tomorrow, "Morning — 6 AM", "booked", 45),
    mk("demo-y7", "Kavya Reddy", "", tomorrow, "Evening — 6 PM", "booked", 20),
  ];
}
