/* FruitQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, items, status, m) => ({
    id, token, customer_name: name, phone,
    details: { items }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Geeta Rani", "", [{ name: "Apple", qty: 2 }], "done", 95),
    mk("demo-5", 5, "Mohan Lal", "98220 44510", [{ name: "Banana", qty: 3 }, { name: "Orange", qty: 2 }], "active", 40),
    mk("demo-6", 6, "Sunita Devi", "", [{ name: "Mango", qty: 1 }, { name: "Grapes", qty: 2 }], "active", 25),
    mk("demo-7", 7, "Ramesh Kumar", "98110 22334", [{ name: "Apple", qty: 1 }, { name: "Banana", qty: 6 }], "queued", 12),
    mk("demo-8", 8, "Kavita Singh", "", [{ name: "Orange", qty: 4 }], "queued", 7),
    mk("demo-9", 9, "Amit Patel", "98901 77882", [{ name: "Grapes", qty: 2 }, { name: "Mango", qty: 3 }], "queued", 3),
  ];
}
