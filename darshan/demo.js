/* DarshanQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, devotees, slot, status, m) => ({
    id, token, customer_name: name, phone,
    details: { devotees, slot }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Suresh Gupta", "", 2, "Morning Aarti", "done", 95),
    mk("demo-5", 5, "Lakshmi Rao", "98220 44510", 4, "Morning Aarti", "active", 40),
    mk("demo-6", 6, "Vikram Singh", "", 3, "Morning Aarti", "active", 25),
    mk("demo-7", 7, "Anita Sharma", "98110 22334", 5, "Evening Aarti", "queued", 12),
    mk("demo-8", 8, "Ravi Verma", "", 2, "Evening Aarti", "queued", 7),
    mk("demo-9", 9, "Pooja Yadav", "98901 77882", 6, "Evening Aarti", "queued", 3),
  ];
}
