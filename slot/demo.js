/* SlotQ — demo seed data, shared by the customer page and the dashboard
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
  const mk = (id, name, phone, date, time, service, status, m) => ({
    id, customer_name: name, phone,
    slot_date: date, slot_time: time, service, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-b1", "Meera Iyer", "", today, "10:00", "Consultation", "done", 300),
    mk("demo-b2", "Dev Patel", "98220 44510", today, "11:00", "Tutoring", "done", 240),
    mk("demo-b3", "Priya Nair", "", today, "12:00", "Career Counselling", "no_show", 180),
    mk("demo-b4", "Aarav Mehta", "98110 22334", today, "14:00", "Consultation", "booked", 120),
    mk("demo-b5", "Sana Sheikh", "", today, "15:00", "Follow-up Visit", "booked", 90),
    mk("demo-b6", "Rohit Kumar", "98901 77882", today, "16:00", "Tutoring", "booked", 45),
    mk("demo-b7", "Kavya Reddy", "", tomorrow, "10:00", "Consultation", "booked", 30),
    mk("demo-b8", "Arjun Singh", "98110 55667", tomorrow, "11:00", "Career Counselling", "booked", 20),
  ];
}
