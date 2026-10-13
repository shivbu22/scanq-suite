/* FlexQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, size, notes, status, m) => ({
    id, token, customer_name: name, phone,
    details: { size, notes }, status,
    file_url: "", file_name: "shop-opening-banner.pdf",
    created_at: ago(m),
  });
  return [
    mk("demo-f4", 4, "Meera Iyer", "", "4 × 6 ft", "Grand opening banner", "done", 95),
    mk("demo-f5", 5, "Dev Patel", "98220 44510", "2 × 3 ft", "Birthday flex", "active", 40),
    mk("demo-f6", 6, "Priya Nair", "", "6 × 10 ft", "Wedding hoarding", "active", 25),
    mk("demo-f7", 7, "Aarav Mehta", "98110 22334", "4 × 6 ft", "Shop board", "queued", 12),
    mk("demo-f8", 8, "Sana Sheikh", "", "2 × 3 ft", "", "queued", 7),
    mk("demo-f9", 9, "Rohit Kumar", "98901 77882", "Custom", "Election banner, 8x12", "queued", 3),
  ];
}
