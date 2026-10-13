/* MenuQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, table, items, status, m) => ({
    id, token, customer_name: name, phone: "",
    details: { table_no: table, items }, status, created_at: ago(m),
  });
  const it = (name, qty, price) => ({ name, qty, price });
  return [
    mk("demo-4", 4, "Meera Iyer", "2",
      [it("Dal Tadka", 1, 160), it("Jeera Rice", 1, 120)], "done", 95),
    mk("demo-5", 5, "Dev Patel", "7",
      [it("Paneer Butter Masala", 1, 220), it("Tandoori Roti (2 pc)", 2, 40)], "active", 40),
    mk("demo-6", 6, "Priya Nair", "3",
      [it("Sweet Lassi", 2, 80)], "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "5",
      [it("Paneer Butter Masala", 1, 220), it("Jeera Rice", 1, 120)], "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "1",
      [it("Masala Papad", 2, 50), it("Dal Tadka", 1, 160)], "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "9",
      [it("Tandoori Roti (2 pc)", 4, 40), it("Dal Tadka", 1, 160)], "queued", 3),
  ];
}
