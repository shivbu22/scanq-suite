/* PharmaQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, medicines, refill, status, m) => ({
    id, token, customer_name: name, phone,
    details: { medicines, refill }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", ["Paracetamol 650mg × 15"], false, "done", 95),
    mk("demo-5", 5, "Dev Patel", "98220 44510", ["Metformin 500mg × 30", "Atorvastatin 10mg × 30"], true, "active", 40),
    mk("demo-6", 6, "Priya Nair", "", ["Azithromycin 500mg × 3"], false, "active", 25),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", ["Cetirizine 10mg × 10", "ORS powder × 4"], false, "queued", 12),
    mk("demo-8", 8, "Sana Sheikh", "", ["Thyroxine 50mcg × 30"], true, "queued", 7),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", ["Amoxicillin 500mg × 10", "Paracetamol 650mg × 10"], false, "queued", 3),
  ];
}
