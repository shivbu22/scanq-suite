/* CanteenQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, items, status, m) => ({
    id, token, customer_name: name, phone,
    details: { items }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Rahul Sharma", "", [{ name: "Thali", qty: 1 }], "done", 95),
    mk("demo-5", 5, "Sneha Kulkarni", "98220 44510", [{ name: "Rajma chawal", qty: 2 }], "active", 40),
    mk("demo-6", 6, "Amit Joshi", "", [{ name: "Chole bhature", qty: 1 }, { name: "Sandwich", qty: 2 }], "active", 25),
    mk("demo-7", 7, "Priya Desai", "98110 22334", [{ name: "Thali", qty: 2 }], "queued", 12),
    mk("demo-8", 8, "Vikas Yadav", "", [{ name: "Sandwich", qty: 3 }], "queued", 7),
    mk("demo-9", 9, "Anjali Menon", "98901 77882", [{ name: "Rajma chawal", qty: 1 }, { name: "Thali", qty: 1 }], "queued", 3),
  ];
}
