/* GasQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoRefills() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const today = dayISO(0);
  const mk = (id, name, phone, consumer, status, m) => ({
    id, customer_name: name, phone, consumer_no: consumer,
    booking_date: today, status, created_at: ago(m),
  });
  return [
    mk("demo-g1", "Meera Iyer", "98220 44510", "12345678", "delivered", 300),
    mk("demo-g2", "Dev Patel", "", "87654321", "delivered", 240),
    mk("demo-g3", "Priya Nair", "98110 22334", "11223344", "booked", 120),
    mk("demo-g4", "Aarav Mehta", "", "44332211", "booked", 45),
    mk("demo-g5", "Sana Sheikh", "98901 77882", "55667788", "cancelled", 200),
  ];
}
