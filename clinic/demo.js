/* ClinicQ — demo seed data, shared by the patient page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, department, status, m) => ({
    id, token, customer_name: name, phone,
    details: { department }, status, created_at: ago(m),
  });
  return [
    mk("demo-9", 9, "Meera Iyer", "", "General Medicine", "done", 95),
    mk("demo-10", 10, "Dev Patel", "98220 44510", "Orthopedics", "active", 40),
    mk("demo-11", 11, "Priya Nair", "", "Eye Care", "active", 25),
    mk("demo-12", 12, "Aarav Mehta", "98110 22334", "General Medicine", "queued", 12),
    mk("demo-13", 13, "Sana Sheikh", "", "Pediatrics", "queued", 7),
    mk("demo-14", 14, "Rohit Kumar", "98901 77882", "Dental", "queued", 3),
  ];
}
