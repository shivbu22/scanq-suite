/* TattooQ — staff dashboard logic (day-wise session bookings). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal, signedUrl,
} from "../shared/sq.js";
import { demoBookings, dayISO } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const DEMO = isDemo();
const api = queueApi(C.APP || "tattoo", C.TABLE || "tattoo_bookings");

const state = { rows: [], muted: false, sb: null, store: null, knownIds: new Set() };

const STATUS_LABEL = { ...(C.STATUS_LABELS || {}), cancelled: "Cancelled" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "InkHouse Studio"));
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
    state.passHash = await getPasscodeHash(sb, C.APP || "tattoo", fallback);
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
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: C.APP || "tattoo",
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
    state.store = demoStore(C.TABLE || "tattoo_bookings", demoBookings);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`${fresh[0].customer_name} — ${prettyDateShort(fresh[0].booking_date)}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(C.TABLE)
        .select("*")
        .order("booking_date", { ascending: true })
        .order("created_at", { ascending: true });
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
      if (fresh) toast(`${row.customer_name} — ${prettyDateShort(row.booking_date)}`);
    });
  }
  renderDash();
}

function prettyDateShort(iso) {
  if (!iso) return "";
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
  const c = {
    booked: state.rows.filter((r) => r.status === "booked").length,
    done: state.rows.filter((r) => r.status === "done").length,
    cancelled: state.rows.filter((r) => r.status === "cancelled").length,
  };
  $("#stBooked").textContent = c.booked;
  $("#stDone").textContent = c.done;
  $("#stCancelled").textContent = c.cancelled;

  const list = $("#bookList");
  const rows = state.rows
    .slice()
    .sort((a, b) => (a.booking_date < b.booking_date ? -1 : a.booking_date > b.booking_date ? 1 : 0));

  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">No bookings yet</div><div>New session bookings will appear here instantly.</div></div>`;
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
  const hasRef = !!r.file_url;

  let actions = "";
  if (r.status === "booked") {
    actions = `<button class="btn primary small" data-act="done" style="width:auto">Mark done</button>
      ${hasRef ? `<button class="btn ghost small" data-act="ref" style="width:auto">Reference image</button>` : ""}
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else if (hasRef) {
    actions = `<button class="btn ghost small" data-act="ref" style="width:auto">Reference image</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:22px">${esc(prettyDateShort(r.booking_date))}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone}</div>
        ${r.design_notes ? `<div class="chips"><span class="chip accent">${esc(r.design_notes)}</span></div>` : ""}
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

  if (act === "ref") {
    // Reference image: signed download URL in real mode; demo has no file.
    if (DEMO || !isConfigured()) {
      toast("No reference image in the demo.");
      return;
    }
    try {
      const url = await signedUrl(state.sb, row.file_url, 600);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast("Could not open image: " + (err.message || err));
    }
    return;
  }

  const next = { done: "done", cancel: "cancelled" }[act];
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
      booking_date: dayISO(1), design_notes: "Geometric sleeve, blackwork", file_url: "",
      status: "booked", created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`${row.customer_name} — ${prettyDateShort(row.booking_date)} (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
