/* SwimQ — demo seed data, shared by the customer page and the dashboard
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
  const mk = (id, name, phone, date, time, status, m) => ({
    id, member_name: name, phone,
    slot_date: date, slot_time: time, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-s1", "Meera Iyer", "", today, "06:00", "done", 300),
    mk("demo-s2", "Dev Patel", "98220 44510", today, "07:00", "done", 240),
    mk("demo-s3", "Priya Nair", "", today, "08:00", "no_show", 180),
    mk("demo-s4", "Aarav Mehta", "98110 22334", today, "16:00", "booked", 120),
    mk("demo-s5", "Sana Sheikh", "", today, "17:00", "booked", 90),
    mk("demo-s6", "Rohit Kumar", "98901 77882", today, "18:00", "booked", 45),
    mk("demo-s7", "Kavya Reddy", "", tomorrow, "06:00", "booked", 30),
    mk("demo-s8", "Arjun Singh", "98110 55667", tomorrow, "07:00", "booked", 20),
  ];
}
