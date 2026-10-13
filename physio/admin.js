/* PhysioQ — staff dashboard logic (patient session packages). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoSessions } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const DEMO = isDemo();
const api = queueApi(C.APP || "physio", C.TABLE || "physio_sessions");

const state = { rows: [], tab: "booked", muted: false, sb: null, store: null, knownIds: new Set() };

const STATUS_LABEL = { ...(C.STATUS_LABELS || {}) };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "MoveWell Physio"));
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
  const fallback = C.PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, C.APP || "physio", fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
}

async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  await boot();
  if (DEMO) simulateArrival();
}

function bindDash() {
  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
      renderDash();
    }));
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: C.APP || "physio",
        getSb: getClient,
        fallbackHash: C.PASSCODE_HASH || "",
        toast,
      });
    }
  }
  $("#btnMute").onclick = () => {
    state.muted = !state.muted;
    $("#btnMute").textContent = state.muted ? "Sound off" : "Sound on";
    $("#btnMute").setAttribute("aria-pressed", String(!state.muted));
  };
  $("#bookList").addEventListener("click", onCardAction);
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(C.TABLE || "physio_sessions", demoSessions);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        const f = fresh[0];
        toast(`${f.patient_name} — ${f.package_total}-session package`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(C.TABLE)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load patients: " + (e.message || e));
      return;
    }
    api.onInsert(state.sb, (row, isUpdate) => {
      applyRow(row);
      const fresh = !isUpdate;
      if (fresh && !state.muted) chime();
      renderDash(fresh ? row.id : null);
      if (fresh) toast(`${row.patient_name} — ${row.package_total}-session package`);
    });
  }
  renderDash();
}

function applyRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i >= 0) state.rows[i] = row;
  else state.rows.push(row);
}

/* ---------- rendering ---------- */
function renderDash(flashId) {
  const active = state.rows.filter((r) => r.status === "booked");
  const c = {
    active: active.length,
    sessions: active.reduce((m, r) => m + (r.sessions_done || 0), 0),
    done: state.rows.filter((r) => r.status === "done").length,
    cancelled: state.rows.filter((r) => r.status === "cancelled").length,
  };
  $("#stActive").textContent = c.active;
  $("#stSessions").textContent = c.sessions;
  $("#stDone").textContent = c.done;
  $("#cActive").textContent = c.active;
  $("#cDone").textContent = c.done;
  $("#cCancelled").textContent = c.cancelled;

  const list = $("#bookList");
  const rows = state.rows
    .filter((r) => r.status === state.tab)
    .sort((a, b) => ((a.created_at || "") > (b.created_at || "") ? -1 : 1));

  if (!rows.length) {
    const msg = {
      booked: ["No active patients", "New package bookings will appear here instantly."],
      done: ["No completed packages yet", "Finished packages show up here."],
      cancelled: ["Nothing cancelled", "Cancelled packages show up here."],
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

function cardHTML(r) {
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";
  const done = r.sessions_done || 0;
  const total = r.package_total || 1;
  const pct = Math.min(100, (done / total) * 100);

  let actions = "";
  if (r.status === "booked") {
    const full = done >= total;
    actions = `<button class="btn primary small" data-act="session" style="width:auto" ${full ? "disabled" : ""}>Mark session done</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qmeta" style="flex:1">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.patient_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone}</div>
        <div class="chips">
          ${r.condition ? `<span class="chip accent">${esc(r.condition)}</span>` : ""}
          <span class="chip">${done} of ${total} sessions</span>
        </div>
        <div class="pbar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
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
  const act = btn.dataset.act;
  btn.disabled = true;
  try {
    if (act === "session") {
      const done = (row.sessions_done || 0) + 1;
      const complete = done >= (row.package_total || 1);
      const patch = { sessions_done: done, ...(complete ? { status: "done" } : {}) };
      if (DEMO || !isConfigured()) {
        state.store?.update(row.id, patch);
        Object.assign(row, patch);
      } else {
        await api.update(state.sb, row.id, patch);
        Object.assign(row, patch); // optimistic; realtime echo will confirm
      }
      toast(complete
        ? `${row.patient_name} — package complete.`
        : `${row.patient_name} — session ${done} of ${row.package_total} done.`);
    } else if (act === "cancel") {
      if (DEMO || !isConfigured()) {
        state.store?.update(row.id, { status: "cancelled" });
        row.status = "cancelled";
      } else {
        await api.update(state.sb, row.id, { status: "cancelled" });
        row.status = "cancelled";
      }
      toast(`${row.patient_name} — package cancelled.`);
    }
    renderDash();
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new patient books a few seconds after opening the preview.
   Goes through the shared store so every open tab sees it. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", patient_name: "Kavya Reddy", phone: "",
      session_date: new Date().toISOString().slice(0, 10), condition: "Back pain",
      package_total: 5, sessions_done: 0,
      status: "booked", created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`${row.patient_name} — 5-session package (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
