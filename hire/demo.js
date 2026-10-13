/* HireQ — demo seed data, shared by the application page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const days = (d, m) => new Date(now - (d * 24 * 60 + m) * 60000).toISOString();
  const mk = (id, name, phone, role, exp, note, status, ts) => ({
    id, name, phone, role, experience: exp, note, status, created_at: ts,
  });
  return [
    mk("demo-1", "Ramesh Yadav", "98110 22334", "Tailor", "3+ yrs",
      "Stitching & alteration, 4 yrs at a boutique.", "shortlisted", days(2, 30)),
    mk("demo-2", "Sunita Devi", "", "Helper", "Fresher", "", "rejected", days(3, 120)),
    mk("demo-3", "Amit Kumar", "98901 77882", "Delivery Boy", "1-2 yrs",
      "Has own bike and licence.", "new", ago(25)),
    mk("demo-4", "Pooja Singh", "98220 44510", "Cashier", "1-2 yrs",
      "Billing experience, basic computer.", "new", ago(60)),
    mk("demo-5", "Vikas Sharma", "", "Helper", "Fresher", "", "new", ago(180)),
    mk("demo-6", "Neha Gupta", "98111 55667", "Cashier", "3+ yrs", "",
      "shortlisted", days(1, 45)),
  ];
}

/* Demo open roles — used only when the "hireq_roles" localStorage key
   has never been set (so demo starts with a small, realistic list). */
export function demoRoles() {
  return ["Helper", "Delivery Boy", "Cashier"];
}
