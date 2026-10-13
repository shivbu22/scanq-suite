/* TentQ — tent house staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const TABLE = cfg().TABLE || "tent_bookings";

const state = { rows: [], tab: "booked", muted: false, sb: null };

const STATUS_LABEL = { ...(cfg().STATUS_LABELS || {}), cancelled: "Cancelled" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Sharma Tent House"));
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "tent", fallback);
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
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: cfg().APP || "tent",
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
        toast(`${fresh[0].customer_name} — ${fresh[0].event_date}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(TABLE)
        .select("*").order("event_date", { ascending: true });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load bookings: " + (e.message || e));
      return;
    }
    state.sb.channel("tentq-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, (p) => {
        const row = p.new || p.old;
        applyRow(row, p.eventType);
        renderDash(p.eventType === "INSERT" ? row.id : null);
        if (p.eventType === "INSERT" && !state.muted) chime();
        if (p.eventType === "INSERT") toast(`${row.customer_name} — ${row.event_date}`);
      })
      .subscribe();
  }
  after();
}

function applyRow(row, type) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (type === "DELETE") { if (i >= 0) state.rows.splice(i, 1); return; }
  if (i >= 0) state.rows[i] = row;
  else state.rows.push(row);
}

/* ---------- rendering ---------- */
function fmtDate(iso) {
  // "2026-10-18" -> "Sat, 18 Oct" — parse as local date, no TZ shift
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function counts() {
  return {
    booked: state.rows.filter((r) => r.status === "booked").length,
    done: state.rows.filter((r) => r.status === "done").length,
    cancelled: state.rows.filter((r) => r.status === "cancelled").length,
  };
}

function renderDash(flashId) {
  const c = counts();
  $("#stBooked").textContent = c.booked;
  $("#stDone").textContent = c.done;
  $("#stCancel").textContent = c.cancelled;
  $("#stBooked").closest(".stat").classList.toggle("hot", c.booked > 0);
  $("#cBooked").textContent = c.booked;
  $("#cDone").textContent = c.done;
  $("#cCancel").textContent = c.cancelled;

  const list = $("#queueList");
  const rows = state.rows
    .filter((r) => r.status === state.tab)
    .sort((a, b) => (a.event_date < b.event_date ? -1 : 1));

  if (!rows.length) {
    const msg = {
      booked: ["No upcoming bookings", "New bookings will appear here instantly."],
      done: ["Nothing delivered yet", "Completed setups show up here."],
      cancelled: ["No cancellations", "Cancelled bookings show up here."],
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
  const items = (r.items || "").split(",").map((s) => s.trim()).filter(Boolean);

  let actions = "";
  if (r.status === "booked") {
    actions = `<button class="btn primary small" data-act="done" style="width:auto">Mark done</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qmeta" style="width:100%">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime"><strong>${esc(fmtDate(r.event_date))}</strong>${phone} · booked ${timeAgo(r.created_at)}</div>
        ${items.length ? `<div class="chips">${items.map((i) => `<span class="chip accent">${esc(i)}</span>`).join("")}</div>` : ""}
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
  const next = { done: "done", cancel: "cancelled" }[btn.dataset.act];
  if (!next) return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.status = next;
      state.store?.update(row.id, { status: next });
    } else {
      const { error } = await state.sb.from(TABLE).update({ status: next }).eq("id", row.id);
      if (error) throw error;
      row.status = next; // optimistic; realtime echo will confirm
    }
    renderDash();
    if (next === "done") toast(`${row.customer_name} — setup delivered.`);
    if (next === "cancelled") toast(`${row.customer_name} — booking cancelled.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new booking comes in a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const rows = state.store.read();
    const d = new Date();
    d.setDate(d.getDate() + 4);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = {
      id: "demo-new", customer_name: "Kavya Reddy", phone: "",
      event_date: iso, items: "Tent, Chairs", status: "booked",
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`Kavya Reddy — ${row.event_date} (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
