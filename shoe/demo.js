/* ShoeQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, issue, status, m) => ({
    id, token, customer_name: name, phone,
    details: { issue }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Ramesh Gupta", "", "Polishing", "done", 95),
    mk("demo-5", 5, "Farhan Ali", "98220 44510", "Sole repair", "active", 40),
    mk("demo-6", 6, "Sunita Yadav", "", "Stitching", "active", 25),
    mk("demo-7", 7, "Vikram Singh", "98110 22334", "Heel change", "queued", 12),
    mk("demo-8", 8, "Neha Kapoor", "", "Sole repair", "queued", 7),
    mk("demo-9", 9, "Amit Verma", "98901 77882", "Polishing", "queued", 3),
  ];
}
