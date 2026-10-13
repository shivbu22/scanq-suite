/* LibraryQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const now = Date.now();
  const day = 86400000;
  const d = (offsetDays) => new Date(now + offsetDays * day).toISOString().slice(0, 10);
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, member, phone, book, issuedOff, dueOff, returned, m) => ({
    id, member_name: member, phone, book_title: book,
    issued_date: d(issuedOff), due_date: d(dueOff),
    returned, created_at: ago(m),
  });
  return [
    mk("demo-1", "Rohan Verma", "98220 44510", "The Guide — R.K. Narayan", -20, -6, false, 29000),
    mk("demo-2", "Sneha Iyer", "", "Harry Potter and the Philosopher's Stone", -10, 4, false, 15000),
    mk("demo-3", "Amit Joshi", "98110 22334", "Atomic Habits", -5, 9, false, 8000),
    mk("demo-4", "Kavya Nair", "", "Pride and Prejudice", -16, -2, false, 23000),
    mk("demo-5", "Dev Patel", "98901 77882", "The Alchemist", -30, -16, true, 43000),
    mk("demo-6", "Meera Rao", "", "Wings of Fire", -3, 11, true, 4000),
  ];
}
