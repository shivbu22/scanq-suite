/* MithaiQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, items, slot, status, m) => ({
    id, token, customer_name: name, phone,
    details: { items, pickup_slot: slot }, status, created_at: ago(m),
  });
  const kg = (name, qty) => ({ name, qty });
  return [
    mk("demo-4", 4, "Ramesh Gupta", "", [kg("Kaju Katli", 1)], "Today Evening", "done", 120),
    mk("demo-5", 5, "Sunita Verma", "98220 44510", [kg("Motichoor Ladoo", 2)], "Today Evening", "active", 45),
    mk("demo-6", 6, "Amit Sharma", "", [kg("Rasgulla", 1), kg("Jalebi", 0.5)], "Today Evening", "active", 28),
    mk("demo-7", 7, "Priya Singh", "98110 22334", [kg("Kaju Katli", 2)], "Tomorrow Morning", "queued", 14),
    mk("demo-8", 8, "Vikram Yadav", "", [kg("Jalebi", 1)], "Tomorrow Morning", "queued", 8),
    mk("demo-9", 9, "Neha Kapoor", "98901 77882", [kg("Motichoor Ladoo", 1), kg("Kaju Katli", 0.5)], "Tomorrow Evening", "queued", 4),
  ];
}
