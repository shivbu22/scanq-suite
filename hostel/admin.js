/* HostelQ — warden dashboard logic (dues + complaints). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoDues, demoComplaints } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const DEMO = isDemo();
const DUES = C.DUES_TABLE || "hostel_dues";
const COMPLAINTS = C.COMPLAINTS_TABLE || "hostel_complaints";

const state = {
  tab: "dues", dues: [], complaints: [],
  muted: false, sb: null, duesStore: null, complaintStore: null,
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Sunrise PG"));
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
    state.passHash = await getPasscodeHash(sb, C.APP || "hostel", fallback);
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
        app: C.APP || "hostel",
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
  $("#dashList").addEventListener("click", onCardAction);
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo stores so the resident
    // page (even in another tab) and the dashboard see each other.
    state.duesStore = demoStore(DUES, demoDues);
    state.complaintStore = demoStore(COMPLAINTS, demoComplaints);
    state.dues = state.duesStore.read();
    state.complaints = state.complaintStore.read();
    state.knownDues = new Set(state.dues.map((r) => r.id));
    state.knownComplaints = new Set(state.complaints.map((r) => r.id));
    state.complaintStore.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownComplaints.has(r.id));
      state.complaints = rows;
      fresh.forEach((r) => state.knownComplaints.add(r.id));
      if (state.tab === "complaints") renderDash(fresh.length ? fresh[0].id : null);
      else renderDash();
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`Complaint — Room ${fresh[0].room_no} · ${fresh[0].category}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const [duesRes, compRes] = await Promise.all([
        state.sb.from(DUES).select("*").order("created_at", { ascending: false }),
        state.sb.from(COMPLAINTS).select("*").order("created_at", { ascending: false }),
      ]);
      if (duesRes.error) throw duesRes.error;
      if (compRes.error) throw compRes.error;
      state.dues = duesRes.data || [];
      state.complaints = compRes.data || [];
    } catch (e) {
      toast("Could not load data: " + (e.message || e));
      return;
    }
    const sub = state.sb.channel("hostel-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: DUES },
        () => reloadTable(DUES))
      .on("postgres_changes", { event: "*", schema: "public", table: COMPLAINTS },
        () => reloadTable(COMPLAINTS))
      .subscribe();
    state.channel = sub;
  }
  renderDash();
}

async function reloadTable(table) {
  try {
    const { data, error } = await state.sb.from(table).select("*").order("created_at", { ascending: false });
    if (error) throw error;
    if (table === DUES) state.dues = data || [];
    else state.complaints = data || [];
    renderDash();
  } catch (_) { /* keep last good render */ }
}

/* ---------- rendering ---------- */
function renderDash(flashId) {
  const unpaid = state.dues.filter((r) => !r.paid);
  const open = state.complaints.filter((r) => r.status === "open");
  const rooms = new Set(state.dues.map((r) => r.room_no)).size;
  $("#stUnpaid").textContent = "₹" + unpaid.reduce((m, r) => m + Number(r.amount || 0), 0).toLocaleString("en-IN");
  $("#stOpen").textContent = open.length;
  $("#stRooms").textContent = rooms;
  $("#cUnpaid").textContent = unpaid.length;
  $("#cOpen").textContent = open.length;

  const list = $("#dashList");
  if (state.tab === "dues") {
    const rows = [...state.dues].sort((a, b) =>
      (a.paid === b.paid) ? String(a.room_no).localeCompare(String(b.room_no)) : (a.paid ? 1 : -1));
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><div class="big">No dues on record</div><div>Dues will appear here as they are added.</div></div>`;
      return;
    }
    list.innerHTML = rows.map(duesCard).join("");
  } else {
    const rows = [...state.complaints].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><div class="big">No complaints</div><div>Resident complaints will appear here instantly.</div></div>`;
      return;
    }
    list.innerHTML = rows.map(complaintCard).join("");
  }
  if (flashId) {
    const el = list.querySelector(`[data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function duesCard(r) {
  const actions = r.paid
    ? `<button class="btn ghost small" data-act="unpaid" data-kind="due" style="width:auto">Mark unpaid</button>`
    : `<button class="btn primary small" data-act="paid" data-kind="due" style="width:auto">Mark paid</button>`;
  return `<div class="qcard" data-id="${r.id}" data-kind="due">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:26px">${esc(String(r.room_no || "–"))}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.resident_name || "—")}</span>
          <span class="st ${r.paid ? "paid" : "unpaid"}">${r.paid ? "Paid" : "Unpaid"}</span>
        </div>
        <div class="qtime">${esc(r.month || "")} · ₹${Number(r.amount || 0).toLocaleString("en-IN")}</div>
      </div>
    </div>
    <div class="qactions">${actions}</div>
  </div>`;
}

function complaintCard(r) {
  let actions = "";
  if (r.status === "open") {
    actions = `<button class="btn primary small" data-act="work" data-kind="complaint" style="width:auto">Start work</button>
      <button class="btn danger-text" data-act="resolved" data-kind="complaint">Resolve</button>`;
  } else if (r.status === "in_progress") {
    actions = `<button class="btn primary small" data-act="resolved" data-kind="complaint" style="width:auto">Mark resolved</button>`;
  }
  return `<div class="qcard" data-id="${r.id}" data-kind="complaint">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:26px">${esc(String(r.room_no || "–"))}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.resident_name || "—")}</span>
          <span class="st ${r.status}">${{ open: "Open", in_progress: "In progress", resolved: "Resolved" }[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}</div>
        <div class="chips"><span class="chip accent">${esc(r.category || "")}</span></div>
        <div style="font-size:14px;color:var(--muted);margin-top:4px">${esc(r.description || "")}</div>
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
  const kind = btn.dataset.kind || card.dataset.kind;
  const rows = kind === "due" ? state.dues : state.complaints;
  const row = rows.find((r) => r.id === card.dataset.id);
  if (!row) return;

  let next;
  if (kind === "due") {
    next = btn.dataset.act === "paid" ? { paid: true } : { paid: false };
  } else {
    const n = { work: "in_progress", resolved: "resolved" }[btn.dataset.act];
    if (!n) return;
    next = { status: n };
  }
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      const store = kind === "due" ? state.duesStore : state.complaintStore;
      Object.assign(row, next);
      store?.update(row.id, next);
    } else {
      const table = kind === "due" ? DUES : COMPLAINTS;
      const { error } = await state.sb.from(table).update(next).eq("id", row.id);
      if (error) throw error;
      Object.assign(row, next); // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(kind === "due"
      ? (next.paid ? `Room ${row.room_no} marked paid.` : `Room ${row.room_no} marked unpaid.`)
      : (next.status === "resolved" ? "Complaint resolved." : "Work started on complaint."));
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the resident page) */

/* demo: a new complaint lands a few seconds after opening the preview.
   Goes through the shared store so every open tab sees it. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", room_no: "104", resident_name: "Sana Sheikh",
      category: "Food", description: "Dinner was served very late today.", status: "open",
      created_at: new Date().toISOString(),
    };
    state.complaintStore.insert(row);
    state.complaints = state.complaintStore.read();
    state.knownComplaints.add(row.id);
    if (!state.muted) chime();
    if (state.tab === "complaints") renderDash(row.id);
    else renderDash();
    toast(`Complaint — Room 104 · Food (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
