/* MenuQ — customer table-ordering page logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = queueApi(cfg().APP || "menu", cfg().TABLE || "menu_queue");
const MENU = cfg().MENU || [];

const state = { row: null, channel: null, qty: {} };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- menu picker ---------- */
function renderMenu() {
  $("#menuList").innerHTML = MENU.map((m, i) => `
    <div class="mrow" data-idx="${i}">
      <div class="minfo"><div class="mname">${esc(m.name)}</div>
      <div class="mprice">₹${m.price}</div></div>
      <div class="stepper">
        <button type="button" data-step="-1" aria-label="Remove one">−</button>
        <span class="qty">0</span>
        <button type="button" data-step="1" aria-label="Add one">+</button>
      </div>
    </div>`).join("");
}
function selectedItems() {
  return MENU.map((m, i) => ({ name: m.name, price: m.price, qty: state.qty[i] || 0 }))
    .filter((x) => x.qty > 0);
}
function orderTotal(items) {
  return items.reduce((s, x) => s + x.price * x.qty, 0);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Sharma Bhojnalaya"));
renderMenu();
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

$("#menuList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-step]");
  if (!b) return;
  const row = b.closest("[data-idx]");
  const i = +row.dataset.idx;
  state.qty[i] = Math.max(0, (state.qty[i] || 0) + (+b.dataset.step));
  row.querySelector(".qty").textContent = state.qty[i];
  $("#orderTotal").textContent = "₹" + orderTotal(selectedItems());
  clearInvalid("items");
});

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inTable").addEventListener("input", () => clearInvalid("table"));
$("#inName").addEventListener("input", () => clearInvalid("name"));

/* ---------- submit ---------- */
$("#tokenForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const table = $("#inTable").value.trim();
  const name = $("#inName").value.trim();
  const items = selectedItems();
  let ok = setInvalid("table", !table);
  ok = setInvalid("name", !name) && ok;
  ok = setInvalid("items", !items.length) && ok;
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
      const store = demoStore(cfg().TABLE || "menu_queue", demoRows);
      const rows = store.read();
      const token = rows.reduce((m, r) => Math.max(m, r.token || 0), 0) + 1;
      row = {
        id: "demo-" + Date.now(), token, customer_name: name, phone: null,
        details: { table_no: table, items }, status: "queued",
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
          phone: null,
          details: { table_no: table, items },
        }])
        .select()
        .single();
      if (error) throw new Error("Could not place order: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showOrder(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Place order";
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
function showOrder(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#tokenNum").textContent = row.token;
  $("#dName").textContent = row.customer_name;
  $("#dTable").textContent = (row.details || {}).table_no || "—";
  const items = (row.details || {}).items || [];
  $("#dItems").innerHTML = items.map((x) =>
    `<div class="oi"><span>${x.qty} × ${esc(x.name)}</span><span class="p">₹${x.qty * x.price}</span></div>`).join("");
  $("#dTotal").textContent = "₹" + orderTotal(items);
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this order live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.demoStore || demoStore(cfg().TABLE || "menu_queue", demoRows);
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
    $("#queuePos").innerHTML = "<strong>Being prepared now.</strong> The kitchen is on your order.";
  } else if (row.status === "done") {
    $("#queuePos").innerHTML = "<strong>Served.</strong> Your food is at the table. Enjoy your meal.";
  } else if (isDemo() || !isConfigured()) {
    $("#queuePos").innerHTML = "<strong>Order sent to the kitchen.</strong> We will bring it to table " +
      esc((row.details || {}).table_no || "") + ".";
  }
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#tokenForm").reset();
  state.qty = {};
  $$("#menuList .qty").forEach((el) => (el.textContent = "0"));
  $("#orderTotal").textContent = "₹0";
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
