/* EventQ — demo seed data, shared by the RSVP page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, guest_name, phone, headcount, checked_in, m) => ({
    id, event_name: "Sharma Wedding", guest_name, phone, headcount,
    checked_in, created_at: ago(m),
  });
  return [
    mk("demo-1", "Aarav Mehta", "98110 22334", 2, true, 95),
    mk("demo-2", "Priya Nair", "", 4, false, 70),
    mk("demo-3", "Rohan Iyer", "98901 77882", 1, true, 52),
    mk("demo-4", "Sneha Kulkarni", "", 3, false, 38),
    mk("demo-5", "Kabir Singh", "98220 44510", 2, false, 21),
    mk("demo-6", "Vikram Rao", "", 5, false, 9),
  ];
}
