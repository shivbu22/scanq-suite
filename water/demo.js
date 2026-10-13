/* WaterQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const dayISO = (dAgo) => new Date(Date.now() - dAgo * 86400000).toISOString().slice(0, 10);
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

export function demoSubs() {
  const mk = (id, name, phone, address, cans_per_day, active, m) => ({
    id, customer_name: name, phone, address, cans_per_day, active,
    created_at: ago(m),
  });
  return [
    mk("demo-w1", "Ramesh Gupta", "98110 22334", "B-42, Green Park", 2, true, 60 * 24 * 20),
    mk("demo-w2", "Sunita Devi", "", "14, Rose Colony", 1, true, 60 * 24 * 12),
    mk("demo-w3", "Amit Verma", "98901 77882", "7, Lake View", 1, false, 60 * 24 * 6),
    mk("demo-w4", "Pooja Sharma", "", "3, Sunrise Apartments", 3, true, 60 * 24 * 2),
  ];
}

export function demoLogs() {
  const mk = (id, sub_id, dAgo, cans) => ({
    id, sub_id, log_date: dayISO(dAgo), cans,
    created_at: ago(dAgo * 60 * 24),
  });
  return [
    mk("demo-wl1", "demo-w1", 0, 2),
    mk("demo-wl2", "demo-w2", 0, 1),
    mk("demo-wl4", "demo-w4", 0, 3),
    mk("demo-wl5", "demo-w1", 1, 2),
    mk("demo-wl6", "demo-w2", 1, 1),
    mk("demo-wl7", "demo-w4", 1, 3),
    mk("demo-wl8", "demo-w1", 2, 2),
    mk("demo-wl9", "demo-w4", 3, 2),
  ];
}
