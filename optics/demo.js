/* OpticsQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, frame, lens, status, m) => ({
    id, token, customer_name: name, phone,
    details: { frame, lens }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", "Full rim", "Single vision", "done", 95),
    mk("demo-5", 5, "Dev Patel", "98220 44510", "Half rim", "Blue-cut", "active", 40),
    mk("demo-6", 6, "Priya Nair", "", "Rimless", "Progressive", "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", "Full rim", "Bifocal", "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "", "Half rim", "Single vision", "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", "Rimless", "Blue-cut", "queued", 3),
  ];
}
