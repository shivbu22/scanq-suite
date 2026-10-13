/* MechanicQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, vehicle_no, issue, status, m) => ({
    id, token, customer_name: name, phone,
    details: { vehicle_no, issue }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Ramesh Gupta", "98100 11223", "DL 01 AB 1234", "General service", "done", 180),
    mk("demo-5", 5, "Suresh Yadav", "", "UP 16 CD 5678", "Brake problem", "active", 60),
    mk("demo-6", 6, "Anil Sharma", "98990 44556", "HR 26 EF 9012", "Engine issue", "active", 35),
    mk("demo-7", 7, "Vikram Singh", "", "DL 08 GH 3456", "Tyre", "queued", 15),
    mk("demo-8", 8, "Pooja Verma", "98111 22334", "UP 14 IJ 7890", "Electrical", "queued", 8),
    mk("demo-9", 9, "Amit Kumar", "", "DL 05 KL 1122", "General service", "queued", 3),
  ];
}
