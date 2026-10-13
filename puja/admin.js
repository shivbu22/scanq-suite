/* PujaQ — staff dashboard logic (day-wise bookings). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoBookings, dayISO } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const DEMO = isDemo();
const api = queueApi(C.APP || "puja", C.TABLE || "puja_bookings");

const state = { rows: [], dateISO: dayISO(0), muted: false, sb: null, store: null, knownIds: new Set() };

const STATUS_LABEL = { ...(C.STATUS_LABELS || {}), no_show: "No-show" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Pandit Sharma Ji"));
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
    state.passHash = await getPasscodeHash(sb, C.APP || "puja", fallback);
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
  for (let i = 0; i < 7; i++) {
    const iso = dayISO(i);
    const l = dayLabel(iso);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slotchip";
    b.dataset.iso = iso;
    b.setAttribute("aria-pressed", String(iso === state.dateISO));
    b.innerHTML = `<span>${i === 0 ? "Today" : l.dow}</span><small>${l.num} ${l.mon}</small>`;
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
        app: C.APP || "puja",
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
    state.store = demoStore(C.TABLE || "puja_bookings", demoBookings);
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
        toast(`${f.customer_name} — ${f.slot_time} (${prettyDateShort(f.booking_date)})`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(C.TABLE)
        .select("*")
        .order("booking_date", { ascending: true })
        .order("slot_time", { ascending: true });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load bookings: " + (e.message || e));
      return;
    }
    api.onInsert(state.sb, (row, isUpdate) => {
      applyRow(row);
      const fresh = !isUpdate;
      if (fresh && !state.muted) chime();
      renderDash(fresh ? row.id : null);
      if (fresh) toast(`${row.customer_name} — ${row.slot_time}`);
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
  const day = state.rows.filter((r) => r.booking_date === state.dateISO);
  const c = {
    booked: day.filter((r) => r.status === "booked").length,
    done: day.filter((r) => r.status === "done").length,
    noshow: day.filter((r) => r.status === "no_show").length,
  };
  $("#stBooked").textContent = c.booked;
  $("#stDone").textContent = c.done;
  $("#stNoshow").textContent = c.noshow;

  const list = $("#bookList");
  const rows = day.sort((a, b) => (a.slot_time < b.slot_time ? -1 : 1));

  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">No bookings this day</div><div>New bookings will appear here instantly.</div></div>`;
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

  let actions = "";
  if (r.status === "booked") {
    actions = `<button class="btn primary small" data-act="done" style="width:auto">Mark done</button>
      <button class="btn ghost small" data-act="noshow" style="width:auto">No-show</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:30px">${esc(r.slot_time || "–")}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone}</div>
        ${r.puja_type ? `<div class="chips"><span class="chip accent">${esc(r.puja_type)}</span></div>` : ""}
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
  const next = { done: "done", noshow: "no_show", cancel: "cancelled" }[btn.dataset.act];
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
    if (next === "done") toast(`${row.customer_name} marked done.`);
    if (next === "no_show") toast(`${row.customer_name} marked as no-show.`);
    if (next === "cancelled") toast(`Booking cancelled.`);
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
      id: "demo-new", customer_name: "Kavya Reddy", phone: "",
      booking_date: dayISO(0), slot_time: "13:00", puja_type: "Havan",
      status: "booked", created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`${row.customer_name} — ${row.slot_time} (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
