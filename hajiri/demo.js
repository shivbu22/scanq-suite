/* HajiriQ — demo seed data, shared by the staff page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const now = Date.now();
const hhmm = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const today = new Date().toISOString().slice(0, 10);

export function demoStaff() {
  return [
    { id: "staff-1", name: "Ramesh Kumar", phone: "98110 22334", daily_wage: 500, active: true, created_at: new Date(now - 90 * 864e5).toISOString() },
    { id: "staff-2", name: "Priya Sharma", phone: "98220 44510", daily_wage: 600, active: true, created_at: new Date(now - 90 * 864e5).toISOString() },
    { id: "staff-3", name: "Amit Verma", phone: "98901 77882", daily_wage: 450, active: true, created_at: new Date(now - 60 * 864e5).toISOString() },
    { id: "staff-4", name: "Sunita Devi", phone: "98111 33445", daily_wage: 400, active: true, created_at: new Date(now - 30 * 864e5).toISOString() },
  ];
}

export function demoAttendance() {
  return [
    { id: "att-1", staff_id: "staff-1", work_date: today, check_in: hhmm(9, 5), check_out: null, status: "present", created_at: hhmm(9, 5) },
    { id: "att-2", staff_id: "staff-2", work_date: today, check_in: hhmm(9, 0), check_out: hhmm(13, 0), status: "half", created_at: hhmm(9, 0) },
    { id: "att-3", staff_id: "staff-3", work_date: today, check_in: null, check_out: null, status: "absent", created_at: hhmm(0, 1) },
    // staff-4 has no row yet → "not marked" in the dashboard
  ];
}
