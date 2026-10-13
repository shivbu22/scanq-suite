/* FlowerQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, occasion, items, status, m) => ({
    id, token, customer_name: name, phone,
    details: { occasion, items }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Ritu Malhotra", "98100 55667", "Wedding",
      [{ name: "Garland", qty: 4 }, { name: "Loose flowers", qty: 2 }], "done", 150),
    mk("demo-5", 5, "Karan Kapoor", "", "Birthday",
      [{ name: "Rose bouquet", qty: 1 }], "active", 45),
    mk("demo-6", 6, "Neha Agarwal", "98990 11223", "Anniversary",
      [{ name: "Mixed bouquet", qty: 2 }], "active", 28),
    mk("demo-7", 7, "Sunita Devi", "", "Pooja",
      [{ name: "Loose flowers", qty: 3 }, { name: "Garland", qty: 2 }], "queued", 14),
    mk("demo-8", 8, "Rahul Jain", "98111 77889", "Just because",
      [{ name: "Rose bouquet", qty: 1 }], "queued", 7),
    mk("demo-9", 9, "Priti Singh", "", "Wedding",
      [{ name: "Garland", qty: 6 }], "queued", 3),
  ];
}
