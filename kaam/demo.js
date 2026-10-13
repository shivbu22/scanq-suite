/* KaamQ — demo seed data, shared by the booking page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, service, address, slot, tech, status, m) => ({
    id, customer_name: name, phone, service, address,
    preferred_time: slot, technician: tech || "", status, created_at: ago(m),
  });
  return [
    mk("demo-k1", "Sunita Sharma", "98110 22334", "Plumbing",
      "B-42, Sector 62, Noida", "Today morning", "Ramesh", "done", 300),
    mk("demo-k2", "Amit Verma", "98901 77882", "Electrical",
      "14, Gali No. 3, Laxmi Nagar, Delhi", "Today morning", "Ramesh", "arrived", 180),
    mk("demo-k3", "Priya Nair", "98220 44510", "Appliance repair",
      "Flat 1204, Prestige Towers, Bengaluru", "Today evening", "Suresh", "assigned", 90),
    mk("demo-k4", "Rohit Kumar", "98110 55667", "Carpentry",
      "H.No 77, Model Town, Ludhiana", "Today evening", "", "queued", 35),
    mk("demo-k5", "Meera Iyer", "98450 11223", "Painting",
      "23, Anna Nagar, Chennai", "Tomorrow morning", "", "queued", 20),
    mk("demo-k6", "Dev Patel", "98980 33445", "Plumbing",
      "C-9, Satellite, Ahmedabad", "Tomorrow morning", "", "queued", 10),
    mk("demo-k7", "Sana Sheikh", "98110 99001", "Electrical",
      "Plot 5, Banjara Hills, Hyderabad", "Tomorrow evening", "", "queued", 5),
  ];
}
