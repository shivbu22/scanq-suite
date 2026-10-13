/* CarWashQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, vehicle, pkg, status, m) => ({
    id, token, customer_name: name, phone,
    details: { vehicle_no: vehicle, package: pkg }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", "UP16 CD 4455", "Foam Wash", "done", 95),
    mk("demo-5", 5, "Dev Patel", "98220 44510", "DL8C Q 2211", "Full Detailing", "active", 40),
    mk("demo-6", 6, "Priya Nair", "", "UP16 AB 9090", "Interior + Exterior", "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", "HR26 DK 7788", "Foam Wash", "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "", "DL10 S 3344", "Interior + Exterior", "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", "UP16 CT 5566", "Foam Wash", "queued", 3),
  ];
}
