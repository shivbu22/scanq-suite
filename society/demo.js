/* SocietyQ — demo seed data, shared by the resident page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoDues() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, flat, name, amount, month, paid, m) => ({
    id, flat_no: flat, resident_name: name, amount, month, paid,
    created_at: ago(m),
  });
  return [
    mk("demo-d1", "A-101", "Ramesh Gupta", 2500, "October 2026", false, 60 * 24 * 5),
    mk("demo-d2", "A-101", "Ramesh Gupta", 2500, "September 2026", true, 60 * 24 * 35),
    mk("demo-d3", "B-204", "Sana Sheikh", 2500, "October 2026", false, 60 * 24 * 5),
    mk("demo-d4", "C-303", "Dev Patel", 3200, "October 2026", true, 60 * 24 * 2),
    mk("demo-d5", "B-204", "Sana Sheikh", 500, "Parking — October 2026", false, 60 * 24 * 5),
  ];
}

export function demoComplaints() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, flat, name, category, description, status, m) => ({
    id, flat_no: flat, resident_name: name, category, description, status,
    created_at: ago(m),
  });
  return [
    mk("demo-c1", "A-101", "Ramesh Gupta", "Plumbing", "Kitchen tap leaking since yesterday.", "in_progress", 60 * 20),
    mk("demo-c2", "B-204", "Sana Sheikh", "Lift", "Lift B stuck between floors this morning.", "open", 60 * 6),
    mk("demo-c3", "C-303", "Dev Patel", "Cleaning", "Staircase B3 not cleaned this week.", "resolved", 60 * 24 * 3),
    mk("demo-c4", "A-102", "Meera Iyer", "Parking", "Someone parked in my slot again.", "open", 45),
  ];
}

export function demoVisitors() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, visitor, flat, purpose, inM, outM) => ({
    id, visitor_name: visitor, flat_no: flat, purpose,
    check_in: ago(inM), check_out: outM == null ? null : ago(outM),
  });
  return [
    mk("demo-v1", "Amit Verma", "A-101", "Delivery", 90, null),
    mk("demo-v2", "Pooja Nair", "B-204", "Guest", 200, 60),
    mk("demo-v3", "Ravi Kumar", "C-303", "Maid service", 30, null),
  ];
}
