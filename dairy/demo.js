/* DairyQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const dayISO = (dAgo) => new Date(Date.now() - dAgo * 86400000).toISOString().slice(0, 10);
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();

export function demoSubs() {
  const mk = (id, name, phone, daily_qty, paused, m) => ({
    id, customer_name: name, phone, daily_qty, paused,
    created_at: ago(m),
  });
  return [
    mk("demo-s1", "Ramesh Gupta", "98110 22334", 2, false, 60 * 24 * 20),
    mk("demo-s2", "Sunita Devi", "", 1, false, 60 * 24 * 12),
    mk("demo-s3", "Amit Verma", "98901 77882", 0.5, true, 60 * 24 * 6),
    mk("demo-s4", "Pooja Sharma", "", 1.5, false, 60 * 24 * 2),
  ];
}

export function demoLogs() {
  const mk = (id, sub_id, dAgo, qty) => ({
    id, sub_id, log_date: dayISO(dAgo), qty,
    created_at: ago(dAgo * 60 * 24),
  });
  return [
    mk("demo-l1", "demo-s1", 0, 2),
    mk("demo-l2", "demo-s2", 0, 1),
    mk("demo-l3", "demo-s4", 0, 1.5),
    mk("demo-l4", "demo-s1", 1, 2),
    mk("demo-l5", "demo-s2", 1, 1),
    mk("demo-l6", "demo-s4", 1, 1.5),
    mk("demo-l7", "demo-s1", 2, 2),
    mk("demo-l8", "demo-s4", 3, 1.5),
  ];
}
