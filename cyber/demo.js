/* CyberQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, job, status, m) => ({
    id, token, customer_name: name, phone,
    details: job, file_url: "", status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", { pages: 12, copies: 2, color: "B&W" }, "done", 95),
    mk("demo-5", 5, "Dev Patel", "98220 44510", { pages: 3, copies: 1, color: "Color" }, "active", 40),
    mk("demo-6", 6, "Priya Nair", "", { pages: 25, copies: 1, color: "B&W" }, "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", { pages: 8, copies: 3, color: "Color" }, "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "", { pages: 2, copies: 5, color: "B&W" }, "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", { pages: 40, copies: 1, color: "Color" }, "queued", 3),
  ];
}
