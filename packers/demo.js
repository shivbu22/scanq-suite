/* PackersQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoQuotes() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const iso = (d) => {
    const t = new Date(now + d * 86400000);
    return t.toISOString().slice(0, 10);
  };
  const mk = (id, name, phone, from, to, move, status, m) => ({
    id, customer_name: name, phone, from_city: from, to_city: to,
    move_date: move, status, created_at: ago(m),
  });
  return [
    mk("demo-1", "Amit Verma", "98110 22334", "Delhi", "Jaipur", iso(3), "done", 2880),
    mk("demo-2", "Sneha Kulkarni", "", "Mumbai", "Pune", iso(1), "confirmed", 300),
    mk("demo-3", "Rajesh Iyer", "98901 77882", "Chennai", "Bengaluru", iso(5), "quoted", 120),
    mk("demo-4", "Pooja Singh", "98220 44510", "Lucknow", "Delhi", iso(8), "quoted", 60),
    mk("demo-5", "Vikram Rao", "", "Hyderabad", "Chennai", iso(10), "new", 25),
    mk("demo-6", "Neha Bansal", "98111 90887", "Noida", "Gurgaon", iso(2), "new", 8),
  ];
}
