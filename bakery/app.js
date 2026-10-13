/* BakeryQ — customer cake pre-order page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoRows, dayISO } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = queueApi(cfg().APP || "bakery", cfg().TABLE || "bakery_queue");

const state = { row: null, channel: null, pickup: dayISO(0) };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Crumb & Craft"));
$("#inCake").innerHTML = (cfg().CAKES || []).map((s) => `<option>${esc(s)}</option>`).join("");
renderDayChips();
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- pickup day chips (next 3 days) ---------- */
function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    dow: dt.toLocaleDateString("en-IN", { weekday: "short" }),
    num: String(d),
    mon: dt.toLocaleDateString("en-IN", { month: "short" }),
  };
}
function renderDayChips() {
  const box = $("#dayChips");
  box.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const iso = dayISO(i);
    const l = dayLabel(iso);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slotchip";
    b.dataset.iso = iso;
    b.setAttribute("aria-pressed", String(iso === state.pickup));
    b.innerHTML = `<span>${i === 0 ? "Today" : l.dow}</span><small>${l.num} ${l.mon}</small>`;
    b.onclick = () => selectDay(iso);
    box.appendChild(b);
  }
}
function selectDay(iso) {
  state.pickup = iso;
  $$("#dayChips .slotchip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.iso === iso)));
  clearInvalid("pickup");
}

/* ---------- kg stepper (0.5 kg steps) ---------- */
function qty() { return parseFloat($("[data-qty]").textContent) || 0; }
function setQty(n) {
  $("[data-qty]").textContent = n % 1 === 0 ? String(n) : n.toFixed(1);
}
$("[data-inc]").onclick = () => setQty(Math.min(10, qty() + 0.5));
$("[data-dec]").onclick = () => setQty(Math.max(0.5, qty() - 0.5));

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inCake").addEventListener("change", () => clearInvalid("cake"));

function pickupLabel(iso) {
  if (iso === dayISO(0)) return "Today";
  if (iso === dayISO(1)) return "Tomorrow";
  const l = dayLabel(iso);
  return `${l.dow} ${l.num} ${l.mon}`;
}

/* ---------- submit ---------- */
$("#tokenForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const cake = $("#inCake").value;
  let ok = setInvalid("name", !name);
  ok = setInvalid("cake", !cake) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Placing order…";
  prog.classList.add("show"); bar.style.width = "30%";

  const items = [{ name: cake, qty: qty() }];
  const pickup_date = state.pickup;

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this order, like the real backend.
      const store = demoStore(cfg().TABLE || "bakery_queue", demoRows);
      const rows = store.read();
      const token = rows.reduce((m, r) => Math.max(m, r.token || 0), 0) + 1;
      row = {
        id: "demo-" + Date.now(), token, customer_name: name,
        phone: $("#inPhone").value.trim() || null,
        details: { items, pickup_date }, status: "queued",
        created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.demoStore = store;
    } else {
      const sb = await getClient();
      const token = await api.nextToken(sb);
      bar.style.width = "70%";
      const { data, error } = await sb.from(cfg().TABLE)
        .insert([{
          token,
          customer_name: name,
          phone: $("#inPhone").value.trim() || null,
          details: { items, pickup_date },
        }])
        .select()
        .single();
      if (error) throw new Error("Could not place order: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showToken(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Place my order";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

function fakeProgress(bar) {
  return new Promise((res) => {
    let w = 30;
    const h = setInterval(() => {
      w = Math.min(96, w + 16);
      bar.style.width = w + "%";
      if (w >= 96) { clearInterval(h); res(); }
    }, 150);
  });
}

/* ---------- order-number view ---------- */
function showToken(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  const items = (row.details || {}).items || [];
  $("#tokenNum").textContent = row.token;
  $("#dName").textContent = row.customer_name;
  $("#dCake").textContent = items.map((it) => `${it.qty} kg ${it.name}`).join(", ") || "—";
  $("#dPickup").textContent = pickupLabel((row.details || {}).pickup_date);
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this order live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.demoStore || demoStore(cfg().TABLE || "bakery_queue", demoRows);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.row.id);
      if (r && r.status !== state.row.status) {
        state.row = r;
        renderStatus(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = api.onRow(sb, row.id, (r) => { state.row = r; renderStatus(r); });
  });
}

function renderStatus(row) {
  const order = ["queued", "active", "done"];
  const idx = order.indexOf(row.status);
  $$("#timeline li").forEach((li) => {
    const s = li.dataset.s;
    const i = order.indexOf(s);
    const finished = row.status === "done";
    li.classList.toggle("done", i < idx || (finished && i <= idx));
    li.classList.toggle("now", i === idx && !finished);
    li.querySelector(".dot").textContent = (i < idx || finished) ? "✓" : (i === idx ? "●" : "");
  });
  if (row.status === "active") {
    $("#queuePos").innerHTML = "<strong>Baking now.</strong> We will have it ready for your pickup.";
  } else if (row.status === "done") {
    $("#queuePos").innerHTML = "<strong>Ready.</strong> Come collect your cake.";
  } else {
    $("#queuePos").innerHTML = "<strong>Order received.</strong> We will bake it fresh for " +
      esc(pickupLabel((row.details || {}).pickup_date)) + ".";
  }
}

/* token auto-advance removed: in the linked demo the dashboard drives status */

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#tokenForm").reset();
  renderDayChips();
  setQty(1);
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
