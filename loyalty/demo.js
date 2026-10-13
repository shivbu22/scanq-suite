/* LoyaltyQ — demo seed data, shared by the customer page and the dashboard
   so both sides of the ?demo=1 preview see the same world. */

export function demoMembers() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, name, phone, stamps, rewards, m) => ({
    id, name, phone, stamps, rewards_earned: rewards, created_at: ago(m),
  });
  return [
    mk("lm-1", "Aarav Mehta", "9811022334", 9, 1, 2600),   // one stamp away
    mk("lm-2", "Priya Nair", "9822044510", 6, 0, 1900),
    mk("lm-3", "Rohit Kumar", "9890177882", 3, 0, 900),
    mk("lm-4", "Sana Sheikh", "9777711223", 10, 2, 1500),  // ready to redeem
    mk("lm-5", "Dev Patel", "9666677889", 1, 0, 45),
  ];
}

export function demoEvents() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60000).toISOString();
  const mk = (id, member_id, kind, m) => ({ id, member_id, kind, created_at: ago(m) });
  return [
    mk("le-1", "lm-5", "stamp", 45),
    mk("le-2", "lm-3", "stamp", 320),
    mk("le-3", "lm-2", "stamp", 520),
    mk("le-4", "lm-1", "stamp", 760),
    mk("le-5", "lm-4", "redeem", 1250),
    mk("le-6", "lm-4", "stamp", 1400),
  ];
}
