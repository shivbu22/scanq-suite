/* CanteenQ — canteen staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const BOARD = params.get("display") === "1";
const DEMO = isDemo();
const api = queueApi(cfg().APP || "canteen", cfg().TABLE || "canteen_queue");

const state = { rows: [], tab: "queued", muted: false, sb: null };

const STATUS_LABEL = { ...(cfg().STATUS_LABELS || {}), cancelled: "Cancelled" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Office Canteen"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   COUNTER DISPLAY BOARD (?display=1) — big tokens for a TV screen
   ================================================================ */
if (BOARD) {
  $("#view-board").hidden = false;
  document.title = "Now serving — " + (cfg().SHOP_NAME || "");
  boot(renderBoard);
}

function renderBoard() {
  const byToken = (a, b) => a.token - b.token;
  const done = state.rows.filter((r) => r.status === "done").sort(byToken);
  const active = state.rows.filter((r) => r.status === "active").sort(byToken);
  const queued = state.rows.filter((r) => r.status === "queued").sort(byToken);
  const main = $("#boardMain"), next = $("#boardNext");
  if (done.length) {
    const cur = done[done.length - 1];
    main.innerHTML = `<div class="k">READY FOR PICKUP</div><div class="n">${cur.token}</div>` +
      `<div class="who">${esc(cur.customer_name)}</div>`;
  } else if (active.length) {
    const cur = active[0];
    main.innerHTML = `<div class="k">COOKING</div><div class="n">${cur.token}</div>` +
      `<div class="who">${esc(cur.customer_name)}</div>`;
  } else if (queued.length) {
    main.innerHTML = `<div class="k">NEXT UP</div><div class="n">${queued[0].token}</div>` +
      `<div class="who">${esc(queued[0].customer_name)}</div>`;
  } else {
    main.innerHTML = `<div class="k">${esc((cfg().SHOP_NAME || "").toUpperCase())}</div>` +
      `<div class="idle" style="margin-top:24px">No orders yet.<br />Scan the QR code to pre-order lunch.</div>`;
  }
  const upcoming = queued.slice(active.length ? 0 : 1, (active.length ? 0 : 1) + 3);
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
  const want = await effectiveHash();
  if (h === want) {
    sessionStorage.setItem("sq_admin", "1");
    showDash();
  } else {
    $("#passErr").style.display = "block";
    $("#inPass").value = "";
    $("#inPass").focus();
  }
}

/* The passcode hash lives in the DB (changeable from the dashboard);
   fall back to config.js when offline/demo/unconfigured. */
async function effectiveHash() {
  if (state.passHash) return state.passHash;
  const fallback = cfg().PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, cfg().APP || "canteen", fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
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
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: cfg().APP || "canteen",
        getSb: getClient,
        fallbackHash: cfg().PASSCODE_HASH || "",
        toast,
      });
    }
  }
  $("#btnMute").onclick = () => {
    state.muted = !state.muted;
    $("#btnMute").textContent = state.muted ? "Sound off" : "Sound on";
    $("#btnMute").setAttribute("aria-pressed", String(!state.muted));
  };
  $("#queueList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(cfg().TABLE || "canteen_queue", demoRows);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      if (BOARD) { renderBoard(); return; }
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`Order ${fresh[0].token} — ${fresh[0].customer_name}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      state.rows = await api.today(state.sb);
    } catch (e) {
      toast("Could not load queue: " + (e.message || e));
      return;
    }
    api.onInsert(state.sb, (row, isUpdate) => {
      if ((row.created_at || "") < todayISO()) return;
      applyRow(row);
      const fresh = !isUpdate;
      if (fresh && !state.muted) chime();
      if (BOARD) renderBoard();
      else {
        renderDash(fresh ? row.id : null);
        if (fresh) toast(`Order ${row.token} — ${row.customer_name}`);
      }
    });
  }
  after();
}

function applyRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i >= 0) state.rows[i] = row;
  else state.rows.push(row);
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
  $("#stQueued").textContent = c.queued;
  $("#stActive").textContent = c.active;
  $("#stDone").textContent = c.done;
  $("#stQueued").closest(".stat").classList.toggle("hot", c.queued > 0);
  $("#cQueued").textContent = c.queued;
  $("#cActive").textContent = c.active;
  $("#cDone").textContent = c.done;

  const list = $("#queueList");
  const rows = state.rows
    .filter((r) => state.tab === "done"
      ? r.status === "done" || r.status === "cancelled"
      : r.status === state.tab)
    .sort((a, b) => a.token - b.token);

  if (!rows.length) {
    const msg = {
      queued: ["No new orders", "Customer orders will appear here instantly."],
      active: ["Nothing cooking", "Use “Cook next order” to start."],
      done: ["Nothing ready yet", "Finished orders show up here."],
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

function itemsText(items) {
  return (items || []).map((it) => `${it.qty} plate ${it.name}`).join(", ");
}

function cardHTML(r) {
  const items = (r.details || {}).items || [];
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";

  let actions = "";
  if (r.status === "queued") {
    actions = `<button class="btn primary small" data-act="start" style="width:auto">Start cooking</button>
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
        ${items.length ? `<div class="chips">${items.map((it) => `<span class="chip accent">${esc(it.qty + " plate " + it.name)}</span>`).join("")}</div>` : ""}
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
  const next = { start: "active", done: "done", cancel: "cancelled" }[btn.dataset.act];
  if (!next) return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.status = next;
      state.store?.update(row.id, { status: next });
    } else {
      await api.update(state.sb, row.id, { status: next });
      row.status = next; // optimistic; realtime echo will confirm
    }
    renderDash();
    if (next === "active") toast(`Order ${row.token} — ${row.customer_name} — is being cooked.`);
    if (next === "done") toast(`Order ${row.token} ready for pickup.`);
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
  if (!next) { toast("No orders waiting."); return; }
  try {
    if (DEMO || !isConfigured()) {
      next.status = "active";
      state.store?.update(next.id, { status: "active" });
    }
    else {
      await api.update(state.sb, next.id, { status: "active" });
      next.status = "active";
    }
    if (state.tab !== "queued") {
      state.tab = "queued";
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === "queued" ? "true" : "false"));
    }
    renderDash();
    toast(`Order ${next.token} — ${next.customer_name} — is being cooked.`);
  } catch (err) {
    toast("Could not advance queue: " + (err.message || err));
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new customer walks in a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const rows = state.store.read();
    const n = rows.reduce((m, r) => Math.max(m, r.token || 0), 0) + 1;
    const row = {
      id: "demo-new", token: n, customer_name: "Kavya Reddy", phone: "",
      details: { items: [{ name: "Thali", qty: 1 }] }, status: "queued",
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`Order ${n} — Kavya Reddy (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
