/* DanceQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

export function demoStudents() {
  const mk = (id, name, phone, style, batch, fee_due, m) => ({
    id, student_name: name, phone, style, batch, fee_due,
    created_at: ago(m),
  });
  return [
    mk("demo-d1", "Aarav Mehta", "98110 22334", "Hip-hop", "Morning", 1500, 60 * 24 * 15),
    mk("demo-d2", "Sana Sheikh", "", "Kathak", "Morning", 0, 60 * 24 * 10),
    mk("demo-d3", "Rohan Iyer", "98901 77882", "Bollywood", "Evening", 1500, 60 * 24 * 7),
    mk("demo-d4", "Diya Nair", "", "Contemporary", "Evening", 0, 60 * 24 * 3),
    mk("demo-d5", "Kabir Singh", "98220 44510", "Hip-hop", "Morning", 1500, 60 * 24),
  ];
}
