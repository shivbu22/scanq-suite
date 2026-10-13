/* BooksQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, token, name, phone, title, author, status, m) => ({
    id, token, customer_name: name, phone,
    details: { titles: [{ title, author }] }, status, created_at: ago(m),
  });
  return [
    mk("demo-4", 4, "Meera Iyer", "", "The God of Small Things", "Arundhati Roy", "done", 300),
    mk("demo-5", 5, "Dev Patel", "98220 44510", "Atomic Habits", "James Clear", "active", 240),
    mk("demo-6", 6, "Priya Nair", "", "The Palace of Illusions", "Chitra Banerjee Divakaruni", "active", 180),
    mk("demo-7", 7, "Aarav Mehta", "98110 22334", "Sapiens", "Yuval Noah Harari", "queued", 120),
    mk("demo-8", 8, "Sana Sheikh", "", "The Guide", "R.K. Narayan", "queued", 60),
    mk("demo-9", 9, "Rohit Kumar", "98901 77882", "The Alchemist", "Paulo Coelho", "queued", 20),
  ];
}
