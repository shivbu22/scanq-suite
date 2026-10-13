/* MeatQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, items, status, m) => ({
    id, token, customer_name: name, phone,
    details: { items }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Salim Khan", "", [{ name: "Chicken", qty: 1 }], "done", 95),
    mk("demo-5", 5, "Joseph D'Souza", "98220 44510", [{ name: "Mutton", qty: 1 }, { name: "Fish", qty: 2 }], "active", 40),
    mk("demo-6", 6, "Priya Nair", "", [{ name: "Eggs (dozen)", qty: 1 }], "active", 25),
    mk("demo-7", 7, "Ramesh Kumar", "98110 22334", [{ name: "Chicken", qty: 2 }], "queued", 12),
    mk("demo-8", 8, "Kavita Singh", "", [{ name: "Fish", qty: 1 }, { name: "Chicken", qty: 1 }], "queued", 7),
    mk("demo-9", 9, "Amit Patel", "98901 77882", [{ name: "Mutton", qty: 2 }], "queued", 3),
  ];
}
