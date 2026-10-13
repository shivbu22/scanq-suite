/* BarberQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, service, status, m) => ({
    id, token, customer_name: name, phone,
    details: { service }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Vikram Rao", "", "Haircut", "done", 95),
    mk("demo-5", 5, "Karan Malhotra", "98220 44510", "Haircut + Shave", "active", 40),
    mk("demo-6", 6, "Suresh Yadav", "", "Shave", "queued", 12),
    mk("demo-7", 7, "Imran Khan", "98110 22334", "Head massage", "queued", 7),
    mk("demo-8", 8, "Deepak Verma", "98901 77882", "Haircut", "queued", 3),
  ];
}
