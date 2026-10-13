/* CateringQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoOrders() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, date, guests, menu, status, m) => ({
    id, customer_name: name, phone,
    event_date: date, guests, menu, status,
    created_at: ago(m),
  });
  return [
    mk("demo-c1", "Meera Iyer", "", dayISO(2), 250, "Veg", "booked", 300),
    mk("demo-c2", "Dev Patel", "98220 44510", dayISO(5), 800, "Non-veg", "booked", 240),
    mk("demo-c3", "Priya Nair", "", dayISO(9), 120, "Jain", "booked", 180),
    mk("demo-c4", "Aarav Mehta", "98110 22334", dayISO(-3), 400, "Mixed", "done", 5000),
    mk("demo-c5", "Sana Sheikh", "", dayISO(14), 150, "Veg", "booked", 90),
    mk("demo-c6", "Rohit Kumar", "98901 77882", dayISO(21), 1000, "Non-veg", "cancelled", 45),
  ];
}
