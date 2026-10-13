/* ParkingQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoTickets() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, vehicle_no, phone, inMin, outMin, amount) => ({
    id, vehicle_no, phone,
    check_in: ago(inMin),
    check_out: outMin == null ? null : ago(outMin),
    amount,
    created_at: ago(inMin),
  });
  return [
    mk("demo-p1", "UP16 CT 8821", "98110 22334", 95, 20, 60),
    mk("demo-p2", "DL8C K 4520", "", 60, null, null),
    mk("demo-p3", "HR26 BQ 1190", "98901 77882", 35, null, null),
    mk("demo-p4", "UP14 FX 6632", "", 180, 90, 100),
    mk("demo-p5", "DL10 CA 9081", "98220 44510", 12, null, null),
  ];
}
