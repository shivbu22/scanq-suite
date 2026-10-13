/* TailorTrack — shop owner dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, queueApi,
} from "../shared/sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const SL = C.STATUS_LABELS || {};
const params = new URLSearchParams(location.search);
const BOARD = params.get("display") === "1";
const DEMO = isDemo();

const state = { rows: [], tab: "queued", muted: false, sb: null };

const STATUS_LABEL = {
  queued: SL.queued || "Cutting",
  active: SL.active || "Stitching",
  done: SL.done || "Ready",
  cancelled: "Cancelled",
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-app-name]").forEach((el) => (el.textContent = C.APP_NAME || "TailorTrack"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   COUNTER DISPLAY BOARD (?display=1) — big order numbers for a TV
   ================================================================ */
if (BOARD) {
  $("#view-board").hidden = false;
  document.title = "Now stitching — " + (C.SHOP_NAME || "");
  boot(boardTick);
}

async function boardTick() {
  renderBoard();
  if (DEMO || !isConfigured()) return;
  state.sb = state.sb || (await getClient());
  const api = queueApi(C.APP, C.TABLE);
  api.onInsert(state.sb, (row) => {
    const i = state.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) state.rows[i] = row; else state.rows.push(row);
    renderBoard();
  });
}

function renderBoard() {
  const active = state.rows.filter((r) => r.status === "active").sort((a, b) => a.token - b.token);
  const waiting = state.rows.filter((r) => r.status === "queued").sort((a, b) => a.token - b.token);
  const main = $("#boardMain"), next = $("#boardNext");
  if (active.length) {
    const cur = active[0];
    main.innerHTML = `<div class="k">STITCHING NOW</div><div class="n">${cur.token}</div>` +
      `<div class="who">${esc(cur.customer_name)}</div>`;
  } else if (waiting.length) {
    main.innerHTML = `<div class="k">NEXT UP</div><div class="n">${waiting[0].token}</div>` +
      `<div class="who">${esc(waiting[0].customer_name)}</div>`;
  } else {
    main.innerHTML = `<div class="k">${esc((C.SHOP_NAME || "").toUpperCase())}</div>` +
      `<div class="idle" style="margin-top:24px">No orders in queue.<br />Scan the QR code at the counter to place one.</div>`;
  }
  const upcoming = waiting.slice(active.length ? 0 : 1, (active.length ? 0 : 1) + 3);
  next.innerHTML = upcoming.length
    ? "Up next: " + upcoming.map((r) => `<strong>${r.token}</strong>`).join(" · ")
    : "";
}

/* ================================================================
   DASHBOARD
   ================================================================ */
if (!BOARD) {
  if (DEMO || sessionStorage.getItem("sq_admin") === "1") showDash();
  else {
    $("#view-lock").hidden = false;
    $("#inPass").focus();
  }
  $("#btnUnlock").onclick = tryUnlock;
  $("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
}

async function tryUnlock() {
  const v = $("#inPass").value.trim();
  if (!v) return;
  const h = await sha256hex(v);
  if (h === (C.PASSCODE_HASH || "")) {
    sessionStorage.setItem("sq_admin", "1");
    showDash();
  } else {
    $("#passErr").style.display = "block";
    $("#inPass").value = "";
    $("#inPass").focus();
  }
}

async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  await boot(renderDash);
  if (DEMO) simulateArrival();
}

function bindDash() {
  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
      renderDash();
    }));
  $("#btnNext").onclick = callNext;
  $("#btnMute").onclick = () => {
    state.muted = !state.muted;
    $("#btnMute").textContent = state.muted ? "Sound off" : "Sound on";
    $("#btnMute").setAttribute("aria-pressed", String(!state.muted));
  };
  $("#queueList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    state.rows = demoOrders();
  } else {
    state.sb = await getClient();
    const api = queueApi(C.APP, C.TABLE);
    try {
      state.rows = await api.today(state.sb);
    } catch (error) {
      toast("Could not load queue: " + (error.message || error));
      return;
    }
    api.onInsert(state.sb, (row, isUpdate) => {
      const i = state.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) state.rows[i] = row; else state.rows.push(row);
      if (!isUpdate && !state.muted) chime();
      if (BOARD) renderBoard(); else renderDash(!isUpdate ? row.id : null);
      if (!isUpdate && !BOARD) toast(`Order ${row.token} — ${row.customer_name}`);
    });
  }
  after();
}

/* ---------- rendering ---------- */
function counts() {
  return {
    queued: state.rows.filter((r) => r.status === "queued").length,
    active: state.rows.filter((r) => r.status === "active").length,
    done: state.rows.filter((r) => r.status === "done" || r.status === "cancelled").length,
  };
}

function renderDash(flashId) {
  const c = counts();
  $("#stWaiting").textContent = c.waiting;
  $("#stPrinting").textContent = c.printing;
  $("#stDone").textContent = c.done;
  $("#stWaiting").closest(".stat").classList.toggle("hot", c.waiting > 0);
  $("#cWaiting").textContent = c.waiting;
  $("#cPrinting").textContent = c.printing;
  $("#cDone").textContent = c.done;

  const list = $("#queueList");
  const rows = state.rows
    .filter((r) =>
      state.tab === "done"
        ? r.status === "done" || r.status === "cancelled"
        : r.status === state.tab)
    .sort((a, b) => a.token - b.token);

  if (!rows.length) {
    const msg = {
      queued: ["Queue is clear", "New orders will appear here instantly."],
      active: ["Nothing on the machine", "Use “Call next order” or start one manually."],
      done: ["Nothing finished yet", "Ready and cancelled orders show up here."],
    }[state.tab];
    list.innerHTML = `<div class="empty"><div class="big">${msg[0]}</div><div>${msg[1]}</div></div>`;
    return;
  }
  list.innerHTML = rows.map(cardHTML).join("");
  if (flashId) {
    const el = list.querySelector(`[data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function measLine(m) {
  m = m || {};
  const parts = [];
  if (m.chest) parts.push("Chest " + esc(m.chest));
  if (m.waist) parts.push("Waist " + esc(m.waist));
  if (m.length) parts.push("Length " + esc(m.length));
  return parts.length ? `<div class="mdetail">${parts.join(" · ")}</div>` : "";
}

function cardHTML(r) {
  const d = r.details || {};
  const garment = d.garment ? `<span class="chip accent">${esc(d.garment)}</span>` : "";
  const due = d.delivery ? `<span class="chip">Due ${esc(fmtDate(d.delivery))}</span>` : "";
  const note = r.note ? `<div class="qnote">“${esc(r.note)}”</div>` : "";
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";

  let actions = "";
  if (r.status === "queued") {
    actions = `<button class="btn primary small" data-act="print" style="width:auto">Start stitching</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else if (r.status === "active") {
    actions = `<button class="btn primary small" data-act="done" style="width:auto">Mark ready</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken">${r.token}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone}</div>
        <div class="chips">${garment}${due}</div>
        ${measLine(d.measurements)}
        ${note}
      </div>
    </div>
    ${actions ? `<div class="qactions">${actions}</div>` : ""}
  </div>`;
}

/* ---------- actions ---------- */
async function onCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const row = state.rows.find((r) => r.id === card.dataset.id);
  if (!row) return;
  const next = { print: "active", done: "done", cancel: "cancelled" }[btn.dataset.act];
  if (!next) return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.status = next;
    } else {
      await queueApi(C.APP, C.TABLE).update(state.sb, row.id, { status: next });
      // realtime echo will update the UI; optimistic patch for snappiness:
      row.status = next;
    }
    renderDash();
    if (next === "active") toast(`Order ${row.token} is now stitching.`);
    if (next === "done") toast(`Order ${row.token} is ready.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

async function callNext() {
  const next = state.rows
    .filter((r) => r.status === "queued")
    .sort((a, b) => a.token - b.token)[0];
  if (!next) { toast("Nobody is waiting."); return; }
  try {
    if (DEMO || !isConfigured()) next.status = "active";
    else {
      await queueApi(C.APP, C.TABLE).update(state.sb, next.id, { status: "active" });
      next.status = "active";
    }
    if (state.tab !== "queued") {
      state.tab = "queued";
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === "queued" ? "true" : "false"));
    }
    renderDash();
    toast(`Order ${next.token} — ${next.customer_name} — is now stitching.`);
  } catch (err) {
    toast("Could not advance queue: " + (err.message || err));
  }
}

/* ---------- demo data ---------- */
function demoOrders() {
  const now = Date.now();
  const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
  return [
    { id: "demo-1", token: 4, customer_name: "Aarav Mehta", phone: "98200 11223", status: "active",
      details: { garment: "Kurta", measurements: { chest: "40", waist: "", length: "42" }, delivery: "2026-10-18" },
      note: "Festive wear", created_at: iso(42) },
    { id: "demo-2", token: 5, customer_name: "Sana Sheikh", phone: "", status: "queued",
      details: { garment: "Blouse", measurements: { chest: "36", waist: "30", length: "" }, delivery: "2026-10-20" },
      note: "", created_at: iso(18) },
    { id: "demo-3", token: 6, customer_name: "Rohit Kumar", phone: "", status: "queued",
      details: { garment: "Shirt", measurements: { chest: "", waist: "", length: "" }, delivery: "" },
      note: "Slim fit", created_at: iso(9) },
    { id: "demo-4", token: 3, customer_name: "Meera Iyer", phone: "", status: "done",
      details: { garment: "Lehenga", measurements: { chest: "38", waist: "32", length: "44" }, delivery: "2026-10-13" },
      note: "", created_at: iso(180) },
  ];
}

/* demo: a new customer walks in a few seconds after opening the preview */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const n = Math.max(...state.rows.map((r) => r.token)) + 1;
    state.rows.push({
      id: "demo-new", token: n, customer_name: "Imran Khan", phone: "",
      status: "queued",
      details: { garment: "Trousers", measurements: { chest: "", waist: "34", length: "41" }, delivery: "2026-10-19" },
      note: "", created_at: new Date().toISOString(),
    });
    if (!state.muted) chime();
    renderDash("demo-new");
    toast(`Order ${n} — Imran Khan (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
