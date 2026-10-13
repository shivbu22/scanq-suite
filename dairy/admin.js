/* DairyQ — dairy owner dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoSubs, demoLogs } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const LOGS = "dairy_logs";
const DEMO = isDemo();

const state = { subs: [], logs: [], muted: false, sb: null, subsStore: null, logsStore: null, knownIds: new Set() };

const STATUS_LABEL = { ...(cfg().STATUS_LABELS || {}) };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Gokul Dairy"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   DASHBOARD
   ================================================================ */
if (DEMO || sessionStorage.getItem("sq_admin") === "1") showDash();
else {
  $("#view-lock").hidden = false;
  $("#inPass").focus();
}
$("#btnUnlock").onclick = tryUnlock;
$("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });

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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "dairy", fallback);
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
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: cfg().APP || "dairy",
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
  $("#subList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo stores so the customer
    // page (even in another tab) and the dashboard see each other.
    state.subsStore = demoStore(cfg().TABLE || "dairy_subs", demoSubs);
    state.logsStore = demoStore(LOGS, demoLogs);
    state.subs = state.subsStore.read();
    state.logs = state.logsStore.read();
    state.knownIds = new Set(state.subs.map((s) => s.id));
    state.subsStore.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.subs = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash();
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`New subscriber — ${fresh[0].customer_name} (${fmtL(fresh[0].daily_qty)}/day)`);
      }
    });
    state.logsStore.onChange((rows) => {
      state.logs = rows;
      renderDash();
    });
  } else {
    state.sb = await getClient();
    try {
      const [{ data: subs, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
        state.sb.from(cfg().TABLE).select("*").order("customer_name"),
        state.sb.from(LOGS).select("*").gte("log_date", todayISO().slice(0, 7) + "-01"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      state.subs = subs || [];
      state.logs = logs || [];
    } catch (e) {
      toast("Could not load subscribers: " + (e.message || e));
      return;
    }
    state.sb.channel("dairy-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: cfg().TABLE }, (p) => {
        applySub(p.new, p.eventType);
        renderDash();
        if (p.eventType === "INSERT" && !state.muted) chime();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: LOGS }, () => {
        refreshLogs().then(renderDash);
      })
      .subscribe();
  }
  after();
}

async function refreshLogs() {
  const { data } = await state.sb.from(LOGS).select("*").gte("log_date", todayISO().slice(0, 7) + "-01");
  state.logs = data || [];
}

function applySub(row, eventType) {
  if (eventType === "DELETE") {
    state.subs = state.subs.filter((s) => s.id !== row.id);
    return;
  }
  const i = state.subs.findIndex((s) => s.id === row.id);
  if (i >= 0) state.subs[i] = row;
  else state.subs.push(row);
}

/* ---------- rendering (function declarations: hoisted, so the
   top-level showDash() -> boot() -> renderDash() chain can use them
   even though it runs during module evaluation) ---------- */
function fmtL(n) { return `${parseFloat(n) % 1 === 0 ? parseInt(n, 10) : parseFloat(n)} L`; }
function today() { return todayISO(); }
function thisMonth() { return todayISO().slice(0, 7); }

function logsFor(subId, date) {
  return state.logs.filter((l) => l.sub_id === subId && l.log_date === date);
}
function monthTotal(subId) {
  return state.logs
    .filter((l) => l.sub_id === subId && (l.log_date || "").startsWith(thisMonth()))
    .reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
}

function renderDash() {
  const todayLogs = state.logs.filter((l) => l.log_date === today());
  const litres = todayLogs.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
  const active = state.subs.filter((s) => !s.paused).length;
  const paused = state.subs.length - active;

  $("#stLitres").textContent = fmtL(litres);
  $("#stActive").textContent = active;
  $("#stPaused").textContent = paused;

  const list = $("#subList");
  if (!state.subs.length) {
    list.innerHTML = `<div class="empty"><div class="big">No subscribers yet</div><div>New subscriptions will appear here instantly.</div></div>`;
    return;
  }
  list.innerHTML = state.subs.map(cardHTML).join("");
}

function cardHTML(s) {
  const t = logsFor(s.id, today());
  const todayQty = t.length ? fmtL(t.reduce((a, l) => a + (parseFloat(l.qty) || 0), 0)) : "—";
  const phone = s.phone ? ` · ${esc(s.phone)}` : "";
  const status = s.paused ? "paused" : "active";
  const action = s.paused
    ? `<button class="btn primary small" data-act="resume" style="width:auto">Resume</button>`
    : `<button class="btn danger-text" data-act="pause">Pause</button>`;

  return `<div class="qcard" data-id="${s.id}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:30px">${fmtL(s.daily_qty)}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(s.customer_name)}</span>
          <span class="st ${status}">${STATUS_LABEL[status] || status}</span>
        </div>
        <div class="qtime">${timeAgo(s.created_at)}${phone}</div>
        <div class="chips"><span class="chip accent">Today: ${todayQty}</span>
        <span class="chip">This month: ${fmtL(monthTotal(s.id))}</span></div>
      </div>
    </div>
    <div class="qactions">${action}</div>
  </div>`;
}

/* ---------- actions ---------- */
async function onCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const sub = state.subs.find((s) => s.id === card.dataset.id);
  if (!sub) return;
  const next = btn.dataset.act === "pause";
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      sub.paused = next;
      state.subsStore?.update(sub.id, { paused: next });
    } else {
      const { error } = await state.sb.from(cfg().TABLE).update({ paused: next }).eq("id", sub.id);
      if (error) throw error;
      sub.paused = next; // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(next ? `${sub.customer_name} paused.` : `${sub.customer_name} resumed.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new subscriber joins a few seconds after opening the preview.
   Goes through the shared stores so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const sub = {
      id: "demo-new", customer_name: "Kavya Reddy", phone: "",
      daily_qty: 1, paused: false, created_at: new Date().toISOString(),
    };
    state.subsStore.insert(sub);
    state.logsStore.insert({
      id: "demo-lnew", sub_id: sub.id, log_date: today(),
      qty: 1, created_at: new Date().toISOString(),
    });
    state.subs = state.subsStore.read();
    state.logs = state.logsStore.read();
    state.knownIds.add(sub.id);
    if (!state.muted) chime();
    renderDash();
    toast(`New subscriber — Kavya Reddy (1 L/day, demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
