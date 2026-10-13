/* PlayQ — staff dashboard logic (inside-now + history). */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoEntries } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const api = queueApi(cfg().APP || "play", cfg().TABLE || "play_entries");

const state = { rows: [], tab: "inside", muted: false, sb: null };

const STATUS_LABEL = { ...(cfg().STATUS_LABELS || {}), inside: "Inside", checked_out: "Checked out" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "FunZone Play Area"));
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "play", fallback);
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
        app: cfg().APP || "play",
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
  $("#entryList").addEventListener("click", onCardAction);
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(cfg().TABLE || "play_entries", demoEntries);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`${fresh[0].child_name} checked in`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(cfg().TABLE)
        .select("*")
        .gte("check_in", todayISO())
        .order("check_in", { ascending: false });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load entries: " + (e.message || e));
      return;
    }
    api.onInsert(state.sb, (row, isUpdate) => {
      if ((row.check_in || "") < todayISO()) return;
      applyRow(row);
      const fresh = !isUpdate;
      if (fresh && !state.muted) chime();
      renderDash(fresh ? row.id : null);
      if (fresh) toast(`${row.child_name} checked in`);
    });
  }
  renderDash();
}

function applyRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i >= 0) state.rows[i] = row;
  else state.rows.push(row);
}

function elapsedStr(fromISO, toISO) {
  const ms = Math.max(0, new Date(toISO || Date.now()) - new Date(fromISO));
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
}

/* ---------- rendering ---------- */
function renderDash(flashId) {
  const inside = state.rows.filter((r) => !r.check_out);
  $("#stInside").textContent = inside.length;
  $("#stToday").textContent = state.rows.length;
  $("#stInside").closest(".stat").classList.toggle("hot", inside.length > 0);
  $("#cInside").textContent = inside.length;
  $("#cHistory").textContent = state.rows.length;

  const list = $("#entryList");
  const rows = (state.tab === "inside" ? inside : [...state.rows])
    .sort((a, b) => new Date(b.check_in) - new Date(a.check_in));

  if (!rows.length) {
    const msg = state.tab === "inside"
      ? ["Nobody inside", "Check-ins will appear here instantly."]
      : ["No entries yet", "Checked-out entries show up here."];
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
  const isIn = !r.check_out;
  const phone = r.parent_phone ? ` · ${esc(r.parent_phone)}` : "";
  const elapsed = isIn
    ? `inside ${elapsedStr(r.check_in)}`
    : `stayed ${elapsedStr(r.check_in, r.check_out)}`;
  const actions = isIn
    ? `<div class="qactions"><button class="btn primary small" data-act="checkout" style="width:auto">Check out</button></div>`
    : "";
  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:34px">🧒</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.child_name)}</span>
          <span class="st ${isIn ? "inside" : "checked_out"}">${isIn ? "Inside" : "Checked out"}</span>
        </div>
        <div class="qtime">${timeAgo(r.check_in)}${phone} · ${elapsed}</div>
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
  const row = state.rows.find((r) => r.id === card.dataset.id);
  if (!row || row.check_out) return;
  const now = new Date().toISOString();
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      state.store?.update(row.id, { check_out: now });
    } else {
      await api.update(state.sb, row.id, { check_out: now });
    }
    row.check_out = now; // optimistic; realtime echo will confirm
    renderDash();
    toast(`${row.child_name} checked out.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new child checks in a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", child_name: "Kavya Reddy", parent_phone: "98220 44510",
      check_in: new Date().toISOString(), check_out: null,
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`${row.child_name} checked in (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
