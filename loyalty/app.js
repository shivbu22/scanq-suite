/* LoyaltyQ — customer stamp-card page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoMembers } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const TARGET = cfg().REWARD_TARGET || 10;
const DEMO = isDemo();
const state = { member: null, store: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

function normPhone(p) {
  return String(p || "").replace(/\D/g, "");
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Chai Point"));
$("#cTarget").textContent = TARGET;
$("#howTarget").textContent = TARGET;
if (DEMO) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !DEMO) $("[data-cfg-warn]").hidden = false;

if (DEMO || !isConfigured()) {
  state.store = demoStore(cfg().TABLE || "loyalty_members", demoMembers);
  if (DEMO) state.store.onChange(() => { if (state.member) refreshMember(); });
}

/* ---------- lookup ---------- */
function setInvalid(bad) {
  document.querySelector('[data-f="phone"]').classList.toggle("invalid", bad);
  return !bad;
}
$("#inPhone").addEventListener("input", () => setInvalid(false));

$("#lookupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = $("#inPhone").value.trim();
  if (!setInvalid(phone.length < 6)) return;
  const btn = $("#btnLookup");
  btn.disabled = true; btn.textContent = "Looking up…";
  try {
    const member = await findMember(phone);
    if (!member) {
      toast("No card found for this number yet — ask at the counter to join.");
      return;
    }
    showCard(member);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Show my card";
  }
});

async function findMember(phone) {
  const digits = normPhone(phone);
  if (DEMO || !isConfigured()) {
    const rows = state.store.read();
    return rows.find((r) => normPhone(r.phone) === digits) || null;
  }
  const sb = await getClient();
  // Match on the digits; stored phones may carry spaces.
  const { data, error } = await sb.from(cfg().TABLE).select("*");
  if (error) throw new Error("Could not look up card: " + error.message);
  return (data || []).find((r) => normPhone(r.phone) === digits) || null;
}

async function refreshMember() {
  if (!state.member) return;
  const m = await findMember(state.member.phone);
  if (m) showCard(m, true);
}

/* ---------- stamp card ---------- */
function showCard(member, keepView) {
  state.member = member;
  if (!keepView) {
    $("#view-form").hidden = true;
    $("#view-card").hidden = false;
    window.scrollTo({ top: 0 });
  }
  $("#cName").textContent = member.name || "Member";
  $("#cPhone").textContent = member.phone || "";
  $("#cCount").textContent = member.stamps || 0;
  $("#cRewards").textContent = member.rewards_earned || 0;

  const grid = $("#stamps");
  grid.innerHTML = "";
  for (let i = 1; i <= TARGET; i++) {
    const full = i <= (member.stamps || 0);
    const d = document.createElement("div");
    d.className = "slot" + (full ? " full" : "");
    d.textContent = full ? "✓" : i;
    // pop the newest stamp so the customer sees it land on a fresh lookup
    if (!keepView && full && i === member.stamps && member.stamps > 0) d.classList.add("pop");
    grid.appendChild(d);
  }
  $("#rewardLine").hidden = (member.stamps || 0) < TARGET;

  if (!DEMO && isConfigured() && !keepView) {
    getClient().then((sb) => {
      state.channel?.unsubscribe?.();
      state.channel = sb
        .channel(cfg().TABLE + "-" + member.id)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: cfg().TABLE, filter: "id=eq." + member.id },
          (p) => showCard(p.new, true))
        .subscribe();
    });
  }
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.member = null;
  $("#lookupForm").reset();
  $("#view-card").hidden = true; $("#view-form").hidden = false;
  $("#inPhone").focus();
  window.scrollTo({ top: 0 });
};

/* Deep link: index.html?phone=9811022334 opens the card directly. */
const qp = new URLSearchParams(location.search).get("phone");
if (qp) {
  $("#inPhone").value = qp;
  $("#lookupForm").dispatchEvent(new Event("submit", { cancelable: true }));
}

window.__sqBoot = true;
