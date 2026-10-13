/* DaycareQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

export function demoCheckins() {
  const mk = (id, child, parent, phone, note, inM, outM) => ({
    id, child_name: child, parent_name: parent, phone, note,
    check_in: ago(inM), check_out: outM == null ? null : ago(outM),
  });
  return [
    mk("demo-k1", "Ayaan Khan", "Farah Khan", "98110 22334", "Nut allergy", 180, null),
    mk("demo-k2", "Myra Iyer", "Divya Iyer", "", "Pickup by grandmother", 150, null),
    mk("demo-k3", "Vivaan Rao", "Kiran Rao", "98901 77882", "", 120, null),
    mk("demo-k4", "Anaya Das", "Ritu Das", "98220 44510", "Lunch box in bag", 300, 90),
    mk("demo-k5", "Ishaan Verma", "Neha Verma", "", "", 420, 200),
  ];
}
