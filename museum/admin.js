/* MuseumQ — staff dashboard logic (day-wise e-tickets). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoTickets, dayISO } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const DEMO = isDemo();
const api = queueApi(C.APP || "museum", C.TABLE || "museum_tickets");
const DAYS = 14;

const state = { rows: [], dateISO: dayISO(0), muted: false, sb: null, store: null, knownIds: new Set() };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "City Museum"));
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
    state.passHash = await getPasscodeHash(sb, C.APP || "museum", fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
}

async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  renderDayChips();
  bindDash();
  await boot();
  if (DEMO) simulateArrival();
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
  for (let i = 0; i < DAYS; i++) {
    const iso = dayISO(i);
    const l = dayLabel(iso);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slotchip";
    b.dataset.iso = iso;
    b.setAttribute("aria-pressed", String(iso === state.dateISO));
    b.innerHTML = `<span>${i === 0 ? "Today" : i === 1 ? "Tmrw" : l.dow}</span><small>${l.num} ${l.mon}</small>`;
    b.onclick = () => { state.dateISO = iso; renderDayChips(); renderDash(); };
    box.appendChild(b);
  }
}

function bindDash() {
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: C.APP || "museum",
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
    state.store = demoStore(C.TABLE || "museum_tickets", demoTickets);
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
        toast(`${f.visitor_name} — ${f.tickets} ticket(s) (${prettyDateShort(f.visit_date)})`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(C.TABLE)
        .select("*")
        .order("visit_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load tickets: " + (e.message || e));
      return;
    }
    api.onInsert(state.sb, (row, isUpdate) => {
      applyRow(row);
      const fresh = !isUpdate;
      if (fresh && !state.muted) chime();
      renderDash(fresh ? row.id : null);
      if (fresh) toast(`${row.visitor_name} — ${row.tickets} ticket(s)`);
    });
  }
  renderDash();
}

function prettyDateShort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function applyRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i >= 0) state.rows[i] = row;
  else state.rows.push(row);
}

/* ---------- rendering ---------- */
function renderDash(flashId) {
  const today = dayISO(0);
  const todayRows = state.rows.filter((r) => r.visit_date === today);
  const sumT = (rs) => rs.reduce((s, r) => s + (r.tickets || 0), 0);
  $("#stToday").textContent = sumT(todayRows);
  $("#stToday").closest(".stat").classList.toggle("hot", sumT(todayRows.filter((r) => !r.used)) > 0);
  $("#stUsed").textContent = sumT(todayRows.filter((r) => r.used));
  $("#stUpcoming").textContent = sumT(state.rows.filter((r) => r.visit_date > today && !r.used));

  const list = $("#bookList");
  const rows = state.rows
    .filter((r) => r.visit_date === state.dateISO)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">No tickets this day</div><div>New bookings will appear here instantly.</div></div>`;
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
  const st = r.used ? "used" : "booked";
  const label = r.used ? "Used" : "Booked";

  let actions = "";
  if (!r.used) {
    actions = `<button class="btn primary small" data-act="use" style="width:auto">Mark used</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken">${r.tickets || 0}<span style="font-size:13px;font-family:inherit;color:var(--muted)"> tkt</span></div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.visitor_name)}</span>
          <span class="st ${st}">${label}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone}</div>
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
  if (!row || btn.dataset.act !== "use") return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.used = true;
      state.store?.update(row.id, { used: true });
    } else {
      await api.update(state.sb, row.id, { used: true });
      row.used = true; // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(`${row.visitor_name} marked used.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new booking lands a few seconds after opening the preview.
   Goes through the shared store so every open tab sees it. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", visitor_name: "Kavya Reddy", phone: "",
      visit_date: dayISO(0), tickets: 3, used: false,
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`${row.visitor_name} — ${row.tickets} ticket(s) (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
