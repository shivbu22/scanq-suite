/* TuitionQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

export function demoStudents() {
  const mk = (id, name, phone, cls, batch, fee_due, m) => ({
    id, student_name: name, phone, class: cls, batch, fee_due,
    created_at: ago(m),
  });
  return [
    mk("demo-t1", "Aarav Mehta", "98110 22334", "Class 10", "Morning", 2000, 60 * 24 * 15),
    mk("demo-t2", "Sana Sheikh", "", "Class 9", "Morning", 0, 60 * 24 * 10),
    mk("demo-t3", "Rohan Iyer", "98901 77882", "Class 12", "Evening", 2000, 60 * 24 * 7),
    mk("demo-t4", "Diya Nair", "", "Class 8", "Evening", 0, 60 * 24 * 3),
    mk("demo-t5", "Kabir Singh", "98220 44510", "Class 11", "Morning", 2000, 60 * 24),
  ];
}
