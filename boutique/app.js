/* BoutiqueQ — customer stitching-order page logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const SL = C.STATUS_LABELS || {};
const api = queueApi(C.APP || "boutique", C.TABLE || "boutique_queue");

const state = { row: null, channel: null, deliveryISO: null, demoStore: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Rani Boutique"));
$("#inItem").innerHTML = (C.ITEMS || []).map((s) => `<option>${esc(s)}</option>`).join("");
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

renderDayChips();

/* ---------- delivery date chips (next 14 days) ---------- */
function dayISO(i) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
}
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
  for (let i = 0; i < 14; i++) {
    const iso = dayISO(i);
    const l = dayLabel(iso);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "daychip";
    b.dataset.iso = iso;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span>${i === 0 ? "Today" : l.dow}</span><small>${l.num} ${l.mon}</small>`;
    b.onclick = () => selectDay(iso);
    box.appendChild(b);
  }
}
function selectDay(iso) {
  state.deliveryISO = iso;
  $$("#dayChips .daychip").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.iso === iso)));
  clearInvalid("delivery");
}

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inItem").addEventListener("change", () => clearInvalid("item"));

/* ---------- submit ---------- */
$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const item = $("#inItem").value;
  let ok = setInvalid("name", !name);
  ok = setInvalid("item", !item) && ok;
  ok = setInvalid("delivery", !state.deliveryISO) && ok;
  if (!ok) return;

  const details = {
    item,
    note: $("#inNote").value.trim(),
    delivery_date: state.deliveryISO,
  };

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Placing order…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      const store = demoStore(C.TABLE || "boutique_queue", demoRows);
      const rows = store.read();
      const token = rows.reduce((m, r) => Math.max(m, r.token || 0), 0) + 1;
      row = {
        id: "demo-" + Date.now(), token, customer_name: name,
        phone: $("#inPhone").value.trim() || null,
        details, status: "queued",
        created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.demoStore = store;
    } else {
      const sb = await getClient();
      const token = await api.nextToken(sb);
      bar.style.width = "70%";
      const { data, error } = await sb.from(C.TABLE)
        .insert([{
          token,
          customer_name: name,
          phone: $("#inPhone").value.trim() || null,
          details,
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

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* ---------- token view ---------- */
function showToken(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#tokenNum").textContent = row.token;
  $("#dName").textContent = row.customer_name;
  $("#dItem").textContent = (row.details || {}).item || "—";
  $("#dDelivery").textContent = fmtDate((row.details || {}).delivery_date);
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    const store = state.demoStore || demoStore(C.TABLE || "boutique_queue", demoRows);
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
    const { count } = await sb.from(C.TABLE)
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO())
      .eq("status", "queued")
      .lt("token", row.token);
    const ahead = count ?? 0;
    $("#queuePos").innerHTML = ahead === 0
      ? "<strong>You are next.</strong> Keep this screen open."
      : `<strong>${ahead} ahead of you.</strong> We will call order ${row.token}.`;
  } catch (_) { /* nicety only */ }
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
    $("#queuePos").innerHTML = `<strong>${SL.active || "Stitching"} now.</strong> Your outfit is on the machine.`;
  } else if (row.status === "done") {
    $("#queuePos").innerHTML = "<strong>Ready for pickup.</strong> Show this screen at the counter.";
  } else if (isDemo() || !isConfigured()) {
    $("#queuePos").innerHTML = `<strong>2 ahead of you.</strong> We will call order ${row.token}.`;
  }
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#orderForm").reset();
  renderDayChips();
  state.deliveryISO = null;
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
