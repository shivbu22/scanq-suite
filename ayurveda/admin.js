/* AyurvedaQ — clinic staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoVisits } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const C = cfg();

const state = { visits: [], dayISO: null, muted: false, sb: null };

const STATUS_LABEL = { ...(C.STATUS_LABELS || {}), cancelled: "Cancelled" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Ayush Ayurveda"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

function dayISO(i) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
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
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* ================================================================
   DASHBOARD (no counter board for this app)
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

async function effectiveHash() {
  if (state.passHash) return state.passHash;
  const fallback = C.PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, C.APP || "ayurveda", fallback);
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
  renderDayChips();
  selectDay(dayISO(0));
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: C.APP || "ayurveda",
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
  $("#visitList").addEventListener("click", onCardAction);
}

function renderDayChips() {
  const box = $("#dayChips");
  box.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const iso = dayISO(i);
    const l = dayLabel(iso);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "daychip";
    b.dataset.iso = iso;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span>${i === 0 ? "Today" : l.dow}</span><small>${l.num} ${l.mon}</small>`;
    b.onclick = () => selectDay(iso);
    box.appendChild(b);
  }
}
function selectDay(iso) {
  state.dayISO = iso;
  $$("#dayChips .daychip").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.iso === iso)));
  renderDash();
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    state.store = demoStore(C.TABLE || "ayurveda_visits", demoVisits);
    state.visits = state.store.read();
    state.knownIds = new Set(state.visits.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.visits = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`${fresh[0].patient_name} booked`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(C.TABLE || "ayurveda_visits")
        .select("*")
        .gte("visit_date", dayISO(0))
        .order("visit_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      state.visits = data || [];
      state.sb.channel("ayurveda-dashboard")
        .on("postgres_changes", { event: "*", schema: "public", table: C.TABLE || "ayurveda_visits" },
          (p) => {
            if (p.eventType === "DELETE") {
              state.visits = state.visits.filter((r) => r.id !== p.old.id);
            } else {
              applyVisit(p.new);
              if (p.eventType === "INSERT" && !state.muted) chime();
            }
            renderDash();
          })
        .subscribe();
    } catch (e) {
      toast("Could not load visits: " + (e.message || e));
      return;
    }
  }
  after();
}

function applyVisit(row) {
  const i = state.visits.findIndex((r) => r.id === row.id);
  if (i >= 0) state.visits[i] = row;
  else state.visits.push(row);
}

/* ---------- rendering ---------- */
function dayVisits() {
  return state.visits.filter((r) => r.visit_date === state.dayISO);
}

function renderDash(flashId) {
  const day = dayVisits();
  $("#stBooked").textContent = day.filter((r) => r.status === "booked").length;
  $("#stDone").textContent = day.filter((r) => r.status === "done").length;
  $("#stFollowup").textContent = state.visits.filter((r) => r.followup_date && r.status === "done").length;

  const list = $("#visitList");
  const rows = day.filter((r) => r.status === "booked")
    .concat(day.filter((r) => r.status !== "booked"));

  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">No appointments</div><div>New bookings for this day will appear here instantly.</div></div>`;
    return;
  }
  list.innerHTML = rows.map(cardHTML).join("");
  if (flashId) {
    const el = list.querySelector(`[data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function cardHTML(r) {
  const treat = r.treatment ? `<span class="chip accent">${esc(r.treatment)}</span>` : "";
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";
  const followup = r.followup_date ? `<div class="qtime">Follow-up: ${fmtDate(r.followup_date)}</div>` : "";

  let actions = "";
  if (r.status === "booked") {
    actions = `<div class="followup">
        <span class="lbl">Follow-up</span>
        <input type="date" data-followup min="${r.visit_date}" value="${r.followup_date || ""}" />
      </div>
      <div class="qactions">
        <button class="btn primary small" data-act="done" style="width:auto">Mark done</button>
        <button class="btn danger-text" data-act="cancel">Cancel</button>
      </div>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken">🌿</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.patient_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone}</div>
        ${treat ? `<div class="chips">${treat}</div>` : ""}
        ${followup}
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
  const row = state.visits.find((r) => r.id === card.dataset.id);
  if (!row) return;
  const next = { done: "done", cancel: "cancelled" }[btn.dataset.act];
  if (!next) return;
  const followupInput = card.querySelector("[data-followup]");
  const followupDate = followupInput ? (followupInput.value || null) : null;
  btn.disabled = true;
  try {
    const patch = { status: next };
    if (next === "done" && followupDate) patch.followup_date = followupDate;
    if (DEMO || !isConfigured()) {
      Object.assign(row, patch);
      state.store?.update(row.id, patch);
    } else {
      const { error } = await state.sb.from(C.TABLE || "ayurveda_visits")
        .update(patch).eq("id", row.id);
      if (error) throw error;
      Object.assign(row, patch);
    }
    renderDash();
    if (next === "done") toast(`${row.patient_name} marked done${followupDate ? ", follow-up " + fmtDate(followupDate) : ""}.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", patient_name: "Meera Nair", phone: "",
      visit_date: dayISO(0), treatment: "Digestion",
      followup_date: null, status: "booked",
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.visits = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast("Meera Nair booked (demo arrival)");
  }, 6000);
}

window.__sqBoot = true;
