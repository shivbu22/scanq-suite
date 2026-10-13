/* ChaiQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, items, status, m) => ({
    id, token, customer_name: name, phone,
    details: { items }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Raju Bhai", "", [{ name: "Kulhad chai", qty: 2 }], "done", 95),
    mk("demo-5", 5, "Mohan Lal", "98220 44510", [{ name: "Masala chai", qty: 3 }, { name: "Coffee", qty: 1 }], "active", 40),
    mk("demo-6", 6, "Sunita Devi", "", [{ name: "Elaichi chai", qty: 2 }], "active", 25),
    mk("demo-7", 7, "Ramesh Kumar", "98110 22334", [{ name: "Kulhad chai", qty: 4 }], "queued", 12),
    mk("demo-8", 8, "Kavita Singh", "", [{ name: "Coffee", qty: 2 }], "queued", 7),
    mk("demo-9", 9, "Amit Patel", "98901 77882", [{ name: "Masala chai", qty: 1 }, { name: "Elaichi chai", qty: 1 }], "queued", 3),
  ];
}
