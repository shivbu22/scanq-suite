/* DJQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(i) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
}

export function demoBookings() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, event_date, event_type, status, m) => ({
    id, customer_name: name, phone, event_date, event_type, status,
    created_at: ago(m),
  });
  return [
    mk("demo-d1", "Rohan Kapoor", "98110 22334", dayISO(-30), "Wedding", "done", 43200),
    mk("demo-d2", "Sneha Rao", "", dayISO(2), "Birthday", "booked", 180),
    mk("demo-d3", "Vikram Singh", "98901 77882", dayISO(5), "Corporate", "booked", 90),
    mk("demo-d4", "Aisha Khan", "", dayISO(9), "Club night", "booked", 45),
    mk("demo-d5", "Kabir Malhotra", "98220 44510", dayISO(14), "Wedding", "booked", 20),
    mk("demo-d6", "Neha Joshi", "", dayISO(21), "Birthday", "booked", 8),
  ];
}
