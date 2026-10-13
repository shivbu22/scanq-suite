/* FeedbackQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoFeedback() {
  const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
  return [
    { id: "d1", rating: 5, category: "Service", comment: "Printed my project report in 10 minutes. Super quick.", name: "Aarav Mehta", status: "new", created_at: ago(12) },
    { id: "d2", rating: 4, category: "Quality", comment: "Good print quality, binding was a little loose.", name: "Sana Sheikh", status: "new", created_at: ago(45) },
    { id: "d3", rating: 2, category: "Staff", comment: "Had to wait even though the shop was empty.", name: "Rohit Kumar", status: "acknowledged", created_at: ago(130) },
    { id: "d4", rating: 5, category: "Price", comment: "Cheapest colour prints in the area.", name: null, status: "acknowledged", created_at: ago(200) },
    { id: "d5", rating: 3, category: "Cleanliness", comment: "Counter area could be tidier.", name: "Priya Nair", status: "resolved", created_at: ago(320) },
    { id: "d6", rating: 1, category: "Service", comment: "Came at lunch time and the shop was closed.", name: null, status: "resolved", created_at: ago(480) },
  ];
}
