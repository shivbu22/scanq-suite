/* CoachQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

export function demoStudents() {
  const mk = (id, name, phone, sport, batch, fee_due, m) => ({
    id, student_name: name, phone, sport, batch, fee_due,
    created_at: ago(m),
  });
  return [
    mk("demo-c1", "Aarav Mehta", "98110 22334", "Football", "Morning", 1500, 60 * 24 * 15),
    mk("demo-c2", "Sana Sheikh", "", "Cricket", "Morning", 0, 60 * 24 * 10),
    mk("demo-c3", "Rohan Iyer", "98901 77882", "Badminton", "Evening", 1500, 60 * 24 * 7),
    mk("demo-c4", "Diya Nair", "", "Swimming", "Evening", 0, 60 * 24 * 3),
    mk("demo-c5", "Kabir Singh", "98220 44510", "Football", "Evening", 1500, 60 * 24),
    mk("demo-c6", "Ishaan Rao", "", "Cricket", "Evening", 0, 30),
  ];
}
