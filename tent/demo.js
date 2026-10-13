/* TentQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const iso = (offsetDays) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, dateOffset, items, status, m) => ({
    id, customer_name: name, phone, event_date: iso(dateOffset),
    items, status, created_at: ago(m),
  });
  return [
    mk("demo-1", "Ramesh Gupta", "98110 44556", 5, "Tent, Chairs, Lights", "booked", 180),
    mk("demo-2", "Sunita Devi", "", 2, "Tent, Tables, Sound", "booked", 120),
    mk("demo-3", "Amit Tiwari", "98901 22334", 9, "Chairs, Tables", "booked", 60),
    mk("demo-4", "Pooja Sharma", "98220 66778", -3, "Tent, Lights, Sound", "done", 4000),
  ];
}
