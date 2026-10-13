/* MessCount — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

const today = () => new Date().toISOString().slice(0, 10);

export function demoRows() {
  const t = Date.now();
  const mk = (mins, name, meal, eating) => ({
    id: "demo-" + name.replace(/\W/g, "") + meal,
    name, meal, eating, rsvp_date: today(),
    created_at: new Date(t - mins * 60000).toISOString(),
  });
  return [
    mk(6, "Aarav Mehta", "lunch", true),
    mk(12, "Priya Nair", "lunch", true),
    mk(18, "Rohan Iyer", "lunch", false),
    mk(25, "Sneha Kulkarni", "lunch", true),
    mk(33, "Kabir Singh", "lunch", true),
    mk(41, "Aarav Mehta", "dinner", true),
    mk(48, "Vikram Rao", "dinner", false),
    mk(55, "Neha Gupta", "dinner", true),
  ];
}
