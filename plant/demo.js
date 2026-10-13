/* PlantQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, plants, status, m) => ({
    id, token, customer_name: name, phone,
    details: { plants }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", [{ name: "Rose", qty: 2 }], "done", 95),
    mk("demo-5", 5, "Dev Patel", "98220 44510", [{ name: "Snake plant", qty: 1 }, { name: "Money plant", qty: 3 }], "active", 40),
    mk("demo-6", 6, "Priya Nair", "", [{ name: "Areca palm", qty: 2 }], "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", [{ name: "Hibiscus", qty: 1 }], "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "", [{ name: "Money plant", qty: 2 }, { name: "Rose", qty: 1 }], "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", [{ name: "Areca palm", qty: 1 }], "queued", 3),
  ];
}
