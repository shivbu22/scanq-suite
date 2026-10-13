/* LaundryQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, items, service, status, m) => ({
    id, token, customer_name: name, phone,
    details: { items, service }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Ritu Sharma", "", [{ name: "Shirts", qty: 4 }], "Wash + Iron", "done", 180),
    mk("demo-5", 5, "Amit Verma", "98110 55667", [{ name: "Suit", qty: 1 }], "Dry Clean", "active", 90),
    mk("demo-6", 6, "Neha Gupta", "", [{ name: "Bedsheet", qty: 2 }, { name: "Blanket", qty: 1 }], "Wash + Iron", "active", 45),
    mk("demo-7", 7, "Vikram Singh", "98990 11223", [{ name: "Shirts", qty: 5 }, { name: "Pants", qty: 3 }], "Wash + Iron", "queued", 20),
    mk("demo-8", 8, "Pooja Yadav", "", [{ name: "Shirts", qty: 2 }], "Iron only", "queued", 8),
  ];
}
