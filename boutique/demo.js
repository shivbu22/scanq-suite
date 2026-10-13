/* BoutiqueQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  // delivery dates as ISO strings relative to today
  const iso = (plusDays) => {
    const d = new Date();
    d.setDate(d.getDate() + plusDays);
    return d.toISOString().slice(0, 10);
  };
  const mk = (id, token, name, phone, item, note, plusDays, status, m) => ({
    id, token, customer_name: name, phone,
    details: { item, note, delivery_date: iso(plusDays) }, status,
    created_at: ago(m),
  });
  return [
    mk("demo-1", 4, "Meera Iyer", "98220 44510", "Blouse", "Chest 36, waist 30", 1, "done", 290),
    mk("demo-2", 5, "Kavya Reddy", "", "Lehenga", "Festive wear, heavy embroidery", -1, "active", 150),
    mk("demo-3", 6, "Priya Nair", "98110 22334", "Suit", "Straight fit", 3, "queued", 60),
    mk("demo-4", 7, "Aarav Mehta", "", "Kurti", "", 5, "queued", 22),
    mk("demo-5", 8, "Sana Sheikh", "98901 77882", "Blouse", "Padded", 0, "queued", 8),
  ];
}
