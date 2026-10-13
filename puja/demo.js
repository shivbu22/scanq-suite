/* PujaQ — demo seed data, shared by the customer page and the dashboard
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
  const mk = (id, name, phone, date, time, puja, status, m) => ({
    id, customer_name: name, phone,
    booking_date: date, slot_time: time, puja_type: puja, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-p1", "Meera Iyer", "", today, "09:00", "Satyanarayan Katha", "done", 300),
    mk("demo-p2", "Dev Patel", "98220 44510", today, "11:00", "Havan", "done", 240),
    mk("demo-p3", "Priya Nair", "", today, "13:00", "Griha Pravesh", "cancelled", 180),
    mk("demo-p4", "Aarav Mehta", "98110 22334", today, "16:00", "Mundan", "booked", 120),
    mk("demo-p5", "Sana Sheikh", "", today, "18:00", "Havan", "booked", 90),
    mk("demo-p6", "Rohit Kumar", "98901 77882", tomorrow, "09:00", "Wedding", "booked", 45),
    mk("demo-p7", "Kavya Reddy", "", tomorrow, "11:00", "Griha Pravesh", "booked", 30),
    mk("demo-p8", "Arjun Singh", "98110 55667", tomorrow, "16:00", "Satyanarayan Katha", "booked", 20),
  ];
}
