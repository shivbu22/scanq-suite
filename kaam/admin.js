/* KaamQ — owner dispatch dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABLE = cfg().TABLE || "kaam_jobs";
const DEMO = isDemo();
const q = queueApi(cfg().APP || "kaam", TABLE); // realtime channels + updates (table-generic)

const state = { rows: [], tab: "queued", muted: false, sb: null };

const STATUS_LABEL = { ...(cfg().STATUS_LABELS || {}), cancelled: "Cancelled" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "KaamQ Home Services"));
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "kaam", fallback);
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
        app: cfg().APP || "kaam",
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
  $("#jobList").addEventListener("click", onCardAction);
}

async function fetchJobs(sb) {
  // kaam_jobs has no token column — order by creation time instead.
  const { data, error } = await sb.from(TABLE)
    .select("*")
    .gte("created_at", todayISO())
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the booking
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(TABLE, demoRows);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`New booking — ${fresh[0].customer_name} · ${fresh[0].service}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      state.rows = await fetchJobs(state.sb);
    } catch (e) {
      toast("Could not load jobs: " + (e.message || e));
      return;
    }
    q.onInsert(state.sb, (row, isUpdate) => {
      if ((row.created_at || "") < todayISO()) return;
      applyRow(row);
      const fresh = !isUpdate;
      if (fresh && !state.muted) chime();
      renderDash(fresh ? row.id : null);
      if (fresh) toast(`New booking — ${row.customer_name} · ${row.service}`);
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
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  return {
    jobs: state.rows.length,
    active: state.rows.filter((r) => ["queued", "assigned", "arrived"].includes(r.status)).length,
    doneWeek: state.rows.filter((r) => r.status === "done" && (r.created_at || "") >= weekAgo).length,
    queued: state.rows.filter((r) => r.status === "queued").length,
    assigned: state.rows.filter((r) => r.status === "assigned").length,
    arrived: state.rows.filter((r) => r.status === "arrived").length,
    done: state.rows.filter((r) => r.status === "done" || r.status === "cancelled").length,
  };
}

function renderDash(flashId) {
  const c = counts();
  $("#stJobs").textContent = c.jobs;
  $("#stActive").textContent = c.active;
  $("#stDone").textContent = c.doneWeek;
  $("#stActive").closest(".stat").classList.toggle("hot", c.active > 0);
  $("#cQueued").textContent = c.queued;
  $("#cAssigned").textContent = c.assigned;
  $("#cArrived").textContent = c.arrived;
  $("#cDone").textContent = c.done;

  const list = $("#jobList");
  const rows = state.rows
    .filter((r) => state.tab === "done"
      ? r.status === "done" || r.status === "cancelled"
      : r.status === state.tab)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (!rows.length) {
    const msg = {
      queued: ["No jobs waiting", "New bookings will appear here instantly."],
      assigned: ["Nobody assigned", "Assign a technician from the Queued tab."],
      arrived: ["Nobody on site", "Technicians on the job show up here."],
      done: ["Nothing finished yet", "Completed and cancelled jobs show up here."],
    }[state.tab];
    list.innerHTML = `<div class="empty"><div class="big">${msg[0]}</div><div>${msg[1]}</div></div>`;
    return;
  }
  list.innerHTML = rows.map(cardHTML).join("");
  if (flashId) {
    const el = list.querySelector(`[data-id="${CSS.escape(flashId)}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function cardHTML(r) {
  const ref = String(r.id).slice(0, 8).toUpperCase();
  const tech = r.technician ? `<div class="qtime">Technician: <strong>${esc(r.technician)}</strong></div>` : "";

  let actions = "";
  if (r.status === "queued") {
    actions = `<div class="assignrow">
        <input class="techin" placeholder="Technician name" aria-label="Technician name" />
        <button class="btn primary small" data-act="assign" style="width:auto">Assign</button>
      </div>
      <div class="qactions"><button class="btn danger-text" data-act="cancel">Cancel</button></div>`;
  } else if (r.status === "assigned") {
    actions = `<div class="qactions">
        <button class="btn primary small" data-act="arrive" style="width:auto">Mark arrived</button>
        <button class="btn danger-text" data-act="cancel">Cancel</button>
      </div>`;
  } else if (r.status === "arrived") {
    actions = `<div class="qactions">
        <button class="btn primary small" data-act="done" style="width:auto">Mark done</button>
        <button class="btn danger-text" data-act="cancel">Cancel</button>
      </div>`;
  }

  return `<div class="qcard" data-id="${esc(r.id)}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:15px;letter-spacing:1px">${ref}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)} · ${esc(r.phone || "")}</div>
        <div class="qtime">${esc(r.preferred_time || "")}</div>
        <div class="qtime" style="color:var(--ink)">${esc(r.address || "")}</div>
        ${tech}
        ${r.service ? `<div class="chips"><span class="chip accent">${esc(r.service)}</span></div>` : ""}
      </div>
    </div>
    ${actions}
  </div>`;
}

/* ---------- actions ---------- */
async function onCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const row = state.rows.find((r) => String(r.id) === card.dataset.id);
  if (!row) return;

  const act = btn.dataset.act;
  let patch = null, msg = "";
  if (act === "assign") {
    const name = card.querySelector(".techin")?.value.trim();
    if (!name) { toast("Enter the technician's name first."); return; }
    patch = { technician: name, status: "assigned" };
    msg = `${row.customer_name} assigned to ${name}.`;
  } else if (act === "arrive") {
    patch = { status: "arrived" };
    msg = `Technician arrived at ${row.customer_name}.`;
  } else if (act === "done") {
    patch = { status: "done" };
    msg = `Job for ${row.customer_name} marked done.`;
  } else if (act === "cancel") {
    patch = { status: "cancelled" };
    msg = `Booking for ${row.customer_name} cancelled.`;
  }
  if (!patch) return;

  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      Object.assign(row, patch);
      state.store?.update(row.id, patch);
    } else {
      await q.update(state.sb, row.id, patch);
      Object.assign(row, patch); // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(msg);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

window.__sqBoot = true;
