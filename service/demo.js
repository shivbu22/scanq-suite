/* ServiceQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
  return [
    { id: "demo-1", token: 11, customer_name: "Priya Nair", phone: "98111 22334", status: "active",
      details: { device: "Redmi Note 12", issue: "Cracked display — touch still works" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0, created_at: iso(55) },
    { id: "demo-2", token: 12, customer_name: "Dev Patel", phone: "", status: "queued",
      details: { device: "iPhone 11", issue: "Battery drains in under 2 hours" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0, created_at: iso(21) },
    { id: "demo-3", token: 13, customer_name: "Karan Joshi", phone: "", status: "queued",
      details: { device: "Samsung M34", issue: "Charging port feels loose" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0, created_at: iso(12) },
    { id: "demo-4", token: 10, customer_name: "Anita Rao", phone: "", status: "done",
      details: { device: "OnePlus 9", issue: "Back glass shattered" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0, created_at: iso(150) },
  ];
}
