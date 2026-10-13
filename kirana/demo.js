/* KiranaQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoRows() {
  const t = Date.now();
  const mk = (mins, token, customer_name, items, status) => ({
    id: "demo-" + token, token,
    customer_name, phone: "", details: { items }, status,
    created_at: new Date(t - mins * 60000).toISOString(),
  });
  return [
    mk(2, 24, "Arjun Nair", ["Biscuits", "Detergent 1kg"], "queued"),
    mk(4, 21, "Meera Shah", ["Atta 5kg", "Sugar 1kg", "Tea 250g"], "queued"),
    mk(9, 22, "Rahul Verma", ["Milk 1L", "Bread", "Eggs (12)"], "queued"),
    mk(14, 23, "Fatima Khan", ["Rice 5kg", "Toor Dal 1kg", "Salt 1kg", "Mustard Oil 1L"], "active"),
    mk(40, 20, "Sunita Rao", ["Atta 5kg", "Milk 1L"], "done"),
  ];
}
