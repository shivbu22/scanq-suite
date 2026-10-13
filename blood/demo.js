/* BloodQ — demo seed data, shared by the registration page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, donor_name, phone, blood_group, last_donation, m) => ({
    id, donor_name, phone, blood_group, last_donation,
    created_at: ago(m),
  });
  return [
    mk("demo-1", "Aarav Mehta", "98110 22334", "A+", "2026-06-12", 190),
    mk("demo-2", "Priya Nair", "", "O+", "2026-07-01", 165),
    mk("demo-3", "Rohit Kumar", "98901 77882", "B+", "", 140),
    mk("demo-4", "Sana Sheikh", "", "AB+", "2026-05-20", 120),
    mk("demo-5", "Dev Patel", "98220 44510", "O-", "", 90),
    mk("demo-6", "Meera Iyer", "", "A-", "2026-08-15", 60),
    mk("demo-7", "Kabir Shah", "97654 11220", "O+", "", 25),
    mk("demo-8", "Ananya Das", "", "B-", "2026-09-02", 8),
  ];
}
