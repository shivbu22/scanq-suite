/* CourierQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, destination, parcel_type, status, m) => ({
    id, token, customer_name: name, phone,
    details: { destination, parcel_type }, status, created_at: ago(m),
  });
  return [
    mk("demo-1", 1, "Rahul Jain", "", "Jaipur", "Document", "done", 300),
    mk("demo-2", 2, "Sneha Kulkarni", "98110 22334", "Mumbai", "Small parcel", "active", 180),
    mk("demo-3", 3, "Farhan Ali", "", "Lucknow", "Document", "active", 120),
    mk("demo-4", 4, "Divya Nair", "98901 77882", "Chennai", "Heavy parcel", "queued", 45),
    mk("demo-5", 5, "Kunal Shah", "", "Ahmedabad", "Small parcel", "queued", 20),
    mk("demo-6", 6, "Anita Desai", "98220 44510", "Kolkata", "Document", "queued", 8),
  ];
}
