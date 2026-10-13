/* AyurvedaQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoVisits() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const iso = (plusDays) => {
    const d = new Date();
    d.setDate(d.getDate() + plusDays);
    return d.toISOString().slice(0, 10);
  };
  const mk = (id, name, phone, plusDays, treatment, followupPlusDays, status, m) => ({
    id, patient_name: name, phone,
    visit_date: iso(plusDays), treatment,
    followup_date: followupPlusDays == null ? null : iso(followupPlusDays),
    status, created_at: ago(m),
  });
  return [
    mk("demo-1", "Ravi Menon", "98220 44510", 0, "Joint pain", 14, "done", 300),
    mk("demo-2", "Lakshmi Rao", "", 0, "Digestion", null, "booked", 120),
    mk("demo-3", "Arjun Nair", "98110 22334", 0, "Stress", null, "booked", 45),
    mk("demo-4", "Divya Iyer", "98901 77882", 1, "Skin", null, "booked", 20),
    mk("demo-5", "Kiran Shah", "", 1, "Weight", null, "booked", 10),
  ];
}
