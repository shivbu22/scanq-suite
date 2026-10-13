/* ReviewQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  /* Realistic skew: mostly 5-star, some 4-star, occasional 3/2, rare 1.
     Spread across the last ~7 days (25 min … ~6.9 days ago). */
  const dist = [
    5, 5, 5, 4, 5, 5, 4, 5, 5, 5,
    4, 5, 5, 3, 5, 4, 5, 5, 2, 5,
    4, 5, 3, 5, 5, 4, 1, 5, 5, 4,
  ];
  const rows = [];
  for (let i = 0; i < dist.length; i++) {
    const minutes = 25 + Math.round((9975 * i) / (dist.length - 1)) + ((i * 53) % 60) - 30;
    rows.push({ id: "demo-tap-" + i, stars: dist[i], created_at: ago(Math.max(5, minutes)) });
  }
  return rows;
}
