/* ValetQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRequests() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, car, name, phone, status, m) => ({
    id, car_no: car, owner_name: name, phone, status,
    created_at: ago(m),
  });
  return [
    mk("demo-v1", "DL 8C AB 1234", "Meera Iyer", "", "returned", 180),
    mk("demo-v2", "HR 26 DK 4451", "Dev Patel", "98220 44510", "parked", 90),
    mk("demo-v3", "UP 16 CT 9988", "Priya Nair", "", "parked", 60),
    mk("demo-v4", "DL 1R 5567", "Aarav Mehta", "98110 22334", "requested", 25),
    mk("demo-v5", "MH 12 GH 2211", "Sana Sheikh", "", "requested", 8),
  ];
}
