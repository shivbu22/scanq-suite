/* SalonQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, service, status, m) => ({
    id, token, customer_name: name, phone,
    details: { service }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", "Haircut", "done", 95),
    mk("demo-5", 5, "Dev Patel", "98220 44510", "Head Massage", "active", 40),
    mk("demo-6", 6, "Priya Nair", "", "Hair Colour", "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", "Haircut", "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "", "Facial", "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", "Shave & Beard Trim", "queued", 3),
  ];
}
