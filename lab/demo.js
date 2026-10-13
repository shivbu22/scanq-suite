/* LabQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, tests, status, m) => ({
    id, token, customer_name: name, phone,
    details: { tests }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", ["CBC"], "done", 180),
    mk("demo-5", 5, "Dev Patel", "98220 44510", ["Lipid Profile", "Blood Sugar (Fasting)"], "done", 120),
    mk("demo-6", 6, "Priya Nair", "", ["Thyroid (TSH)"], "active", 45),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", ["CBC", "Urine Routine"], "active", 30),
    mk("demo-8", 8, "Sana Sheikh", "", ["HbA1c"], "queued", 12),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", ["Lipid Profile"], "queued", 5),
  ];
}
