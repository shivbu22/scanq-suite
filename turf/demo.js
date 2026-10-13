/* TurfQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoSlots() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, date, time, turf, status, m) => ({
    id, customer_name: name, phone,
    slot_date: date, slot_time: time, turf_name: turf, status,
    created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-t1", "Rohan Verma", "", today, "06:00", "Turf A", "done", 420),
    mk("demo-t2", "Aditya Rao", "98220 44510", today, "07:00", "Turf A", "done", 360),
    mk("demo-t3", "Kabir Shah", "", today, "08:00", "Turf B", "no_show", 300),
    mk("demo-t4", "Arjun Nair", "98110 22334", today, "17:00", "Turf A", "booked", 150),
    mk("demo-t5", "Dev Malhotra", "", today, "18:00", "Turf A", "booked", 120),
    mk("demo-t6", "Ishaan Bose", "98901 77882", today, "18:00", "Turf B", "booked", 100),
    mk("demo-t7", "Vivaan Menon", "", today, "19:00", "Turf A", "booked", 80),
    mk("demo-t8", "Aarav Pillai", "98110 55667", tomorrow, "07:00", "Turf A", "booked", 40),
    mk("demo-t9", "Krishna Iyer", "", tomorrow, "08:00", "Turf B", "booked", 30),
  ];
}
