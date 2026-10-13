/* PlayQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoEntries() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, child, phone, inM, outM) => ({
    id, child_name: child, parent_phone: phone,
    check_in: ago(inM), check_out: outM == null ? null : ago(outM),
  });
  return [
    mk("demo-p1", "Aarav Mehta", "98110 22334", 95, 20),
    mk("demo-p2", "Sana Sheikh", "98901 44510", 70, null),
    mk("demo-p3", "Rohan Iyer", "", 45, null),
    mk("demo-p4", "Diya Nair", "98220 77882", 25, null),
    mk("demo-p5", "Kabir Rao", "98110 55667", 10, null),
  ];
}
