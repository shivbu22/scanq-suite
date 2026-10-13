/* ChaatQ — customer street-food order page logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = queueApi(cfg().APP || "chaat", cfg().TABLE || "chaat_queue");

const state = { row: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Balle Balle Chaat"));
buildItemRows();
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- chaat checklist with plate-qty steppers ---------- */
function buildItemRows() {
  const list = $("#itemList");
  list.innerHTML = "";
  (cfg().ITEMS || []).forEach((name) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `<span class="iname">${esc(name)}</span>
      <span class="stepper">
        <button type="button" data-dec aria-label="Remove one">−</button>
        <span class="qty" data-qty>0</span><span class="unit">plate</span>
        <button type="button" data-inc aria-label="Add one">+</button>
      </span>`;
    row.querySelector("[data-inc]").onclick = () => setQty(row, qty(row) + 1);
    row.querySelector("[data-dec]").onclick = () => setQty(row, Math.max(0, qty(row) - 1));
    list.appendChild(row);
  });
}
function qty(row) { return parseInt(row.querySelector("[data-qty]").textContent, 10) || 0; }
function setQty(row, n) {
  row.querySelector("[data-qty]").textContent = n;
  clearInvalid("items");
}
function selectedItems() {
  return [...$("#itemList").querySelectorAll(".item-row")]
    .map((row) => ({ name: row.querySelector(".iname").textContent, qty: qty(row) }))
    .filter((it) => it.qty > 0);
}
function itemsText(items) {
  return (items || []).map((it) => `${it.qty} plate ${it.name}`).join(", ") || "—";
}

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));

/* ---------- submit ---------- */
$("#tokenForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const items = selectedItems();
  let ok = setInvalid("name", !name);
  ok = setInvalid("items", items.length === 0) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Placing order…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this order, like the real backend.
      const store = demoStore(cfg().TABLE || "chaat_queue", demoRows);
      const rows = store.read();
      const token = rows.reduce((m, r) => Math.max(m, r.token || 0), 0) + 1;
      row = {
        id: "demo-" + Date.now(), token, customer_name: name,
        phone: $("#inPhone").value.trim() || null,
        details: { items }, status: "queued",
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
          details: { items },
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
    btn.disabled = false; btn.textContent = "Get my order number";
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

/* ---------- order view ---------- */
function showToken(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#tokenNum").textContent = row.token;
  $("#dName").textContent = row.customer_name;
  $("#dItems").textContent = itemsText((row.details || {}).items);
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this order live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.demoStore || demoStore(cfg().TABLE || "chaat_queue", demoRows);
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
    state.channel = api.onRow(sb, row.id, (r) => { state.row = r; renderStatus(r); refreshPosition(sb); });
    refreshPosition(sb);
  });
}

async function refreshPosition(sb) {
  const row = state.row;
  if (!row || row.status !== "queued") return;
  try {
    const { count } = await sb.from(cfg().TABLE)
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO())
      .eq("status", "queued")
      .lt("token", row.token);
    const ahead = count ?? 0;
    $("#queuePos").innerHTML = ahead === 0
      ? "<strong>You are next.</strong> Please stay nearby."
      : `<strong>${ahead} ahead of you.</strong> We will call order ${row.token}.`;
  } catch (_) { /* position is a nicety — never break the page */ }
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
    $("#queuePos").innerHTML = "<strong>Cooking now.</strong> Your chaat is on the tawa.";
  } else if (row.status === "done") {
    $("#queuePos").innerHTML = "<strong>Ready.</strong> Show this screen at the cart.";
  } else if (isDemo() || !isConfigured()) {
    $("#queuePos").innerHTML = "<strong>2 ahead of you.</strong> We will call order " + row.token + ".";
  }
}

/* token auto-advance removed: in the linked demo the dashboard drives status */

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#tokenForm").reset();
  buildItemRows();
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
