/* WatchQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, issue, status, m) => ({
    id, token, customer_name: name, phone,
    details: { issue }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Anil Verma", "", "Battery", "done", 95),
    mk("demo-5", 5, "Ritu Malhotra", "98220 44510", "Servicing", "active", 40),
    mk("demo-6", 6, "Karan Singh", "", "Glass", "active", 25),
    mk("demo-7", 7, "Neha Gupta", "98110 22334", "Strap", "queued", 12),
    mk("demo-8", 8, "Vikram Rao", "", "Battery", "queued", 7),
    mk("demo-9", 9, "Pooja Sharma", "98901 77882", "Servicing", "queued", 3),
  ];
}
