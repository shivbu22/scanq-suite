/* GiftQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, item, message, status, m) => ({
    id, token, customer_name: name, phone,
    details: { item, message }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", "Photo frame", "Our Goa trip, 2024 — Sneha", "done", 95),
    mk("demo-5", 5, "Dev Patel", "98220 44510", "Photo mug", "World's best dad!", "active", 40),
    mk("demo-6", 6, "Priya Nair", "", "Custom cushion", "Happy Anniversary, 25 years of us", "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", "Name necklace", "Aarav ♥", "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "", "Photo mug", "Best sister ever", "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", "Photo frame", "For Dadi's 80th birthday", "queued", 3),
  ];
}
