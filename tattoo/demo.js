/* TattooQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function dayISO(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function demoBookings() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, date, notes, status, m) => ({
    id, customer_name: name, phone,
    booking_date: date, design_notes: notes, file_url: "",
    status, created_at: ago(m),
  });
  const today = dayISO(0), tomorrow = dayISO(1);
  return [
    mk("demo-t1", "Dev Patel", "98220 44510", today, "Koi fish, half sleeve, colour", "done", 300),
    mk("demo-t2", "Sana Sheikh", "", today, "Minimal rose on wrist", "done", 240),
    mk("demo-t3", "Rohit Kumar", "98901 77882", today, "Script lettering, forearm", "booked", 120),
    mk("demo-t4", "Priya Nair", "", today, "Mandala back piece, black & grey", "booked", 90),
    mk("demo-t5", "Arjun Singh", "98110 55667", tomorrow, "Dragon chest piece", "booked", 45),
    mk("demo-t6", "Meera Iyer", "", tomorrow, "Fine-line butterfly, shoulder", "booked", 20),
  ];
}
