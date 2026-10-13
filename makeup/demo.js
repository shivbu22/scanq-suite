/* MakeupQ — demo seed data, shared by the customer page and the dashboard
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
  const mk = (id, name, phone, date, time, pkg, status, m) => ({
    id, customer_name: name, phone,
    booking_date: date, slot_time: time, package: pkg, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-m1", "Meera Iyer", "", today, "09:00", "Bridal", "done", 300),
    mk("demo-m2", "Dev Patel", "98220 44510", today, "10:00", "Engagement", "done", 240),
    mk("demo-m3", "Priya Nair", "", today, "11:00", "Party", "no_show", 180),
    mk("demo-m4", "Aarav Mehta", "98110 22334", today, "12:00", "Bridal", "booked", 120),
    mk("demo-m5", "Sana Sheikh", "", today, "14:00", "Pre-wedding shoot", "booked", 90),
    mk("demo-m6", "Rohit Kumar", "98901 77882", today, "15:00", "Party", "booked", 45),
    mk("demo-m7", "Kavya Reddy", "", tomorrow, "10:00", "Bridal", "booked", 30),
    mk("demo-m8", "Arjun Singh", "98110 55667", tomorrow, "11:00", "Engagement", "booked", 20),
  ];
}
