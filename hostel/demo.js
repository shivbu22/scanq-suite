/* HostelQ — demo seed data, shared by the resident page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoDues() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, room, name, amount, month, paid, m) => ({
    id, room_no: room, resident_name: name, amount, month, paid,
    created_at: ago(m),
  });
  return [
    mk("demo-d1", "101", "Aarav Mehta", 6500, "October", true, 4320),
    mk("demo-d2", "102", "Dev Patel", 6500, "October", false, 4300),
    mk("demo-d3", "103", "Priya Nair", 7000, "October", false, 4280),
    mk("demo-d4", "101", "Aarav Mehta", 6500, "September", true, 57600),
    mk("demo-d5", "104", "Sana Sheikh", 6500, "October", true, 4200),
    mk("demo-d6", "105", "Rohit Kumar", 6500, "October", false, 4180),
  ];
}

export function demoComplaints() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, room, name, cat, desc, status, m) => ({
    id, room_no: room, resident_name: name, category: cat,
    description: desc, status, created_at: ago(m),
  });
  return [
    mk("demo-c1", "102", "Dev Patel", "Water", "Tap in bathroom 102 is leaking since yesterday.", "open", 300),
    mk("demo-c2", "103", "Priya Nair", "WiFi", "WiFi keeps disconnecting on the 1st floor.", "in_progress", 180),
    mk("demo-c3", "105", "Rohit Kumar", "Electricity", "Tube light not working in room 105.", "open", 60),
    mk("demo-c4", "101", "Aarav Mehta", "Cleanliness", "Corridor dustbin overflowing.", "resolved", 1440),
  ];
}
