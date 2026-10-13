/* BakeryQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, items, pickup_date, status, m) => ({
    id, token, customer_name: name, phone,
    details: { items, pickup_date }, status, created_at: ago(m),
  });
  return [
    mk("demo-1", 1, "Ritu Sharma", "", [{ name: "Pineapple", qty: 1 }], dayISO(0), "done", 300),
    mk("demo-2", 2, "Amit Verma", "98110 22334", [{ name: "Chocolate Truffle", qty: 2 }], dayISO(0), "active", 180),
    mk("demo-3", 3, "Neha Gupta", "", [{ name: "Red Velvet", qty: 1.5 }], dayISO(0), "active", 120),
    mk("demo-4", 4, "Suresh Yadav", "98901 77882", [{ name: "Butterscotch", qty: 1 }], dayISO(1), "queued", 45),
    mk("demo-5", 5, "Pooja Singh", "", [{ name: "Chocolate Truffle", qty: 0.5 }, { name: "Pineapple", qty: 0.5 }], dayISO(1), "queued", 20),
    mk("demo-6", 6, "Vikram Rao", "98220 44510", [{ name: "Red Velvet", qty: 2 }], dayISO(2), "queued", 8),
  ];
}
