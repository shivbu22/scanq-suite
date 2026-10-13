/* CoWorkQ — demo seed data, shared by the customer page and the dashboard
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
  const mk = (id, name, phone, date, desk, status, m) => ({
    id, member_name: name, phone,
    booking_date: date, desk_no: desk, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-b1", "Meera Iyer", "", today, "D-1", "done", 300),
    mk("demo-b2", "Dev Patel", "98220 44510", today, "D-2", "done", 240),
    mk("demo-b3", "Priya Nair", "", today, "D-3", "no_show", 180),
    mk("demo-b4", "Aarav Mehta", "98110 22334", today, "D-4", "booked", 120),
    mk("demo-b5", "Sana Sheikh", "", today, "D-5", "booked", 90),
    mk("demo-b6", "Rohit Kumar", "98901 77882", today, "D-6", "booked", 45),
    mk("demo-b7", "Kavya Reddy", "", tomorrow, "D-1", "booked", 30),
    mk("demo-b8", "Arjun Singh", "98110 55667", tomorrow, "D-2", "booked", 20),
  ];
}
