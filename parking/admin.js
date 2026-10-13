/* ParkingQ — staff dashboard logic (digital parking tickets). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoTickets } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const C = cfg();
const DEMO = isDemo();
const api = queueApi(C.APP || "parking", C.TABLE || "parking_tickets");

const state = { rows: [], muted: false, sb: null, store: null, knownIds: new Set() };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "CityPark"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $("[data-cfg-warn]").hidden = false;

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
    state.passHash = await getPasscodeHash(sb, C.APP || "parking", fallback);
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
        app: C.APP || "parking",
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
  $("#parkedList").addEventListener("click", onCheckOut);
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(C.TABLE || "parking_tickets", demoTickets);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`New ticket — ${fresh[0].vehicle_no}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(C.TABLE)
        .select("*")
        .order("check_in", { ascending: false });
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
      if (fresh) toast(`New ticket — ${row.vehicle_no}`);
    });
  }
  renderDash();
}

function applyRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i >= 0) state.rows[i] = row;
  else state.rows.push(row);
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function prettyTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function duration(from, to) {
  const ms = new Date(to) - new Date(from);
  if (isNaN(ms) || ms < 0) return "";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return mins + " min";
  const h = Math.floor(mins / 60);
  return h + "h " + (mins % 60) + "m";
}

/* ---------- rendering ---------- */
function renderDash(flashId) {
  const parked = state.rows
    .filter((r) => !r.check_out)
    .sort((a, b) => (a.check_in < b.check_in ? -1 : 1));
  const today = state.rows.filter((r) => (r.check_in || "").slice(0, 10) === todayISO());
  const revenue = state.rows
    .filter((r) => r.check_out && (r.check_out || "").slice(0, 10) === todayISO())
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  $("#stParked").textContent = parked.length;
  $("#stParked").closest(".stat").classList.toggle("hot", parked.length > 0);
  $("#stToday").textContent = today.length;
  $("#stRevenue").textContent = "₹" + revenue;

  const pl = $("#parkedList");
  if (!parked.length) {
    pl.innerHTML = `<div class="empty"><div class="big">Lot is empty</div><div>New tickets will appear here instantly.</div></div>`;
  } else {
    pl.innerHTML = parked.map(parkedCard).join("");
  }

  const hist = state.rows
    .filter((r) => r.check_out)
    .sort((a, b) => (a.check_out < b.check_out ? 1 : -1))
    .slice(0, 30);
  const hl = $("#historyList");
  if (!hist.length) {
    hl.innerHTML = `<div class="empty"><div class="big">No check-outs yet</div><div>Completed tickets show up here.</div></div>`;
  } else {
    hl.innerHTML = hist.map(histCard).join("");
  }

  if (flashId) {
    const el = document.querySelector(`#parkedList [data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function parkedCard(r) {
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";
  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:24px">${esc(r.vehicle_no)}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="st parked">Parked</span>
        </div>
        <div class="qtime">In ${timeAgo(r.check_in)} · ${esc(prettyTime(r.check_in))}${phone}</div>
      </div>
    </div>
    <div class="qactions">
      <div class="checkout-row">
        <input type="number" min="0" inputmode="numeric" placeholder="₹ amount" data-amt="${r.id}" aria-label="Parking amount" />
        <button class="btn primary small" data-act="checkout" style="width:auto">Check out</button>
      </div>
    </div>
  </div>`;
}

function histCard(r) {
  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:24px">${esc(r.vehicle_no)}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="st out">Checked out</span>
          ${r.amount != null ? `<span class="chip accent">₹${esc(String(r.amount))}</span>` : ""}
        </div>
        <div class="qtime">${esc(prettyTime(r.check_in))} → ${esc(prettyTime(r.check_out))}${r.check_in && r.check_out ? " · " + duration(r.check_in, r.check_out) : ""}</div>
      </div>
    </div>
  </div>`;
}

/* ---------- check-out ---------- */
async function onCheckOut(e) {
  const btn = e.target.closest("[data-act='checkout']");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const row = state.rows.find((r) => r.id === card.dataset.id);
  if (!row || row.check_out) return;
  const input = card.querySelector(`[data-amt="${row.id}"]`);
  const amount = input ? Number(input.value) : NaN;
  if (!input || input.value === "" || isNaN(amount) || amount < 0) {
    toast("Enter the parking amount first.");
    input?.focus();
    return;
  }
  btn.disabled = true;
  const patch = { check_out: new Date().toISOString(), amount };
  try {
    if (DEMO || !isConfigured()) {
      state.store?.update(row.id, patch);
      Object.assign(row, patch);
    } else {
      await api.update(state.sb, row.id, patch);
      Object.assign(row, patch); // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(`${row.vehicle_no} checked out — ₹${amount}.`);
  } catch (err) {
    toast("Check-out failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new vehicle drives in a few seconds after opening the preview.
   Goes through the shared store so every open tab sees it. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", vehicle_no: "UP16 DT 4477", phone: "",
      check_in: new Date().toISOString(), check_out: null, amount: null,
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`New ticket — ${row.vehicle_no} (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
