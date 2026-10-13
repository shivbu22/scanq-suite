/* PhotoQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, order_type, specs, status, m) => ({
    id, token, customer_name: name, phone,
    details: { order_type, specs }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", "Prints", "12 passport photos", "done", 95),
    mk("demo-5", 5, "Dev Patel", "98220 44510", "Album", "Wedding album, 40 pages", "active", 40),
    mk("demo-6", 6, "Priya Nair", "", "Framed", "12x18 family portrait", "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", "Prints", "20 4x6 holiday photos", "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "", "Album", "Baby album, 20 pages", "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", "Framed", "A3 graduation frame", "queued", 3),
  ];
}
