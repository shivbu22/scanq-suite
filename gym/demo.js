/* GymQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoMembers() {
  const day = 86400000;
  const now = Date.now();
  const d = (offsetDays) => new Date(now + offsetDays * day).toISOString().slice(0, 10);
  const mk = (id, name, phone, plan, fee_due, m) => ({
    id, name, phone, plan, fee_due,
    created_at: new Date(now - m * 60000).toISOString(),
  });
  return [
    mk("demo-m1", "Rohan Khanna", "98110 22334", "Yearly", d(120), 4000),
    mk("demo-m2", "Simran Kaur", "98990 44556", "Quarterly", d(20), 3000),
    mk("demo-m3", "Arjun Patel", "98220 77889", "Monthly", d(-5), 2000),
    mk("demo-m4", "Ishita Rao", "98111 99000", "Monthly", d(3), 1000),
  ];
}

export function demoCheckins() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, member_id, member_name, m) => ({
    id, member_id, member_name, created_at: ago(m),
  });
  return [
    mk("demo-c1", "demo-m1", "Rohan Khanna", 95),
    mk("demo-c2", "demo-m2", "Simran Kaur", 40),
    mk("demo-c3", "demo-m4", "Ishita Rao", 12),
  ];
}
