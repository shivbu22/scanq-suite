/* BanquetQ — demo seed data, shared by the customer page and the dashboard
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
  const mk = (id, name, phone, date, slot, status, m) => ({
    id, customer_name: name, phone,
    event_date: date, slot, status,
    created_at: ago(m),
  });
  return [
    mk("demo-b1", "Meera Iyer", "", dayISO(3), "Evening", "booked", 300),
    mk("demo-b2", "Dev Patel", "98220 44510", dayISO(3), "Morning", "booked", 240),
    mk("demo-b3", "Priya Nair", "", dayISO(10), "Full day", "booked", 180),
    mk("demo-b4", "Aarav Mehta", "98110 22334", dayISO(-5), "Evening", "done", 8000),
    mk("demo-b5", "Sana Sheikh", "", dayISO(17), "Morning", "booked", 90),
    mk("demo-b6", "Rohit Kumar", "98901 77882", dayISO(24), "Evening", "cancelled", 45),
  ];
}
