/* MandiQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, items, status, m) => ({
    id, token, customer_name: name, phone,
    details: { items }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Sharma Trading Co.", "98110 55667",
      [{ name: "Wheat", qty: 20 }, { name: "Mustard", qty: 5 }], "done", 120),
    mk("demo-5", 5, "Ramesh Gupta", "",
      [{ name: "Onion", qty: 12 }], "active", 55),
    mk("demo-6", 6, "Khan & Sons", "98901 22334",
      [{ name: "Potato", qty: 25 }, { name: "Onion", qty: 8 }], "active", 30),
    mk("demo-7", 7, "Verma Agro", "",
      [{ name: "Rice", qty: 15 }], "queued", 14),
    mk("demo-8", 8, "Hari Om Traders", "98220 88990",
      [{ name: "Wheat", qty: 40 }], "queued", 8),
    mk("demo-9", 9, "New Grain Co.", "",
      [{ name: "Mustard", qty: 6 }, { name: "Rice", qty: 10 }], "queued", 4),
  ];
}
