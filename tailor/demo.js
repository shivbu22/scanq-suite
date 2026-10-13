/* TailorTrack — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
  return [
    { id: "demo-1", token: 4, customer_name: "Aarav Mehta", phone: "98200 11223", status: "active",
      details: { garment: "Kurta", measurements: { chest: "40", waist: "", length: "42" }, delivery: "2026-10-18" },
      note: "Festive wear", created_at: iso(42) },
    { id: "demo-2", token: 5, customer_name: "Sana Sheikh", phone: "", status: "queued",
      details: { garment: "Blouse", measurements: { chest: "36", waist: "30", length: "" }, delivery: "2026-10-20" },
      note: "", created_at: iso(18) },
    { id: "demo-3", token: 6, customer_name: "Rohit Kumar", phone: "", status: "queued",
      details: { garment: "Shirt", measurements: { chest: "", waist: "", length: "" }, delivery: "" },
      note: "Slim fit", created_at: iso(9) },
    { id: "demo-4", token: 3, customer_name: "Meera Iyer", phone: "", status: "done",
      details: { garment: "Lehenga", measurements: { chest: "38", waist: "32", length: "44" }, delivery: "2026-10-13" },
      note: "", created_at: iso(180) },
  ];
}
