/* TuitionQ — tuition staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoStudents } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();

const state = { students: [], tab: "all", muted: false, sb: null, store: null, knownIds: new Set() };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Sharma Tuitions"));
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
  const fallback = cfg().PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, cfg().APP || "tuition", fallback);
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
        app: cfg().APP || "tuition",
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
  $("#stuList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(cfg().TABLE || "tuition_students", demoStudents);
    state.students = state.store.read();
    state.knownIds = new Set(state.students.map((s) => s.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.students = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`New enrollment — ${fresh[0].student_name} (${fresh[0].class})`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(cfg().TABLE).select("*").order("student_name");
      if (error) throw error;
      state.students = data || [];
    } catch (e) {
      toast("Could not load students: " + (e.message || e));
      return;
    }
    state.sb.channel("tuition-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: cfg().TABLE }, (p) => {
        applyStudent(p.new, p.eventType);
        renderDash(p.eventType === "INSERT" ? p.new.id : null);
        if (p.eventType === "INSERT" && !state.muted) chime();
      })
      .subscribe();
  }
  after();
}

function applyStudent(row, eventType) {
  if (eventType === "DELETE") {
    state.students = state.students.filter((s) => s.id !== row.id);
    return;
  }
  const i = state.students.findIndex((s) => s.id === row.id);
  if (i >= 0) state.students[i] = row;
  else state.students.push(row);
}

/* ---------- rendering ---------- */
function fmtRs(n) { return "₹" + (parseFloat(n) || 0).toLocaleString("en-IN"); }
function due(s) { return parseFloat(s.fee_due) || 0; }

function renderDash(flashId) {
  const n = state.students.length;
  const dueCount = state.students.filter((s) => due(s) > 0).length;
  $("#stStudents").textContent = n;
  $("#stDue").textContent = dueCount;
  $("#stDue").closest(".stat").classList.toggle("hot", dueCount > 0);
  $("#stPaid").textContent = n - dueCount;
  $("#cAll").textContent = n;
  $("#cMorning").textContent = state.students.filter((s) => s.batch === "Morning").length;
  $("#cEvening").textContent = state.students.filter((s) => s.batch === "Evening").length;

  const list = $("#stuList");
  const rows = state.students
    .filter((s) => state.tab === "all" || s.batch === state.tab)
    .sort((a, b) => (a.student_name || "").localeCompare(b.student_name || ""));

  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">No students here</div><div>New enrollments will appear instantly.</div></div>`;
    return;
  }
  list.innerHTML = rows.map(cardHTML).join("");
  if (flashId) {
    const el = list.querySelector(`[data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function cardHTML(s) {
  const phone = s.phone ? ` · ${esc(s.phone)}` : "";
  const isDue = due(s) > 0;
  const action = isDue
    ? `<button class="btn primary small" data-act="paid" style="width:auto">Mark fee paid</button>`
    : `<button class="btn danger-text" data-act="reopen">Reopen fee</button>`;

  return `<div class="qcard" data-id="${s.id}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:22px">🎓</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(s.student_name)}</span>
          <span class="st ${isDue ? "due" : "paid"}">${isDue ? "Fee due " + fmtRs(s.fee_due) : "Paid"}</span>
        </div>
        <div class="qtime">Enrolled ${timeAgo(s.created_at)}${phone}</div>
        <div class="chips"><span class="chip accent">${esc(s.class || "—")}</span>
        <span class="chip">${esc(s.batch || "—")} batch</span></div>
      </div>
    </div>
    <div class="qactions">${action}</div>
  </div>`;
}

/* ---------- actions ---------- */
async function onCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const s = state.students.find((x) => x.id === card.dataset.id);
  if (!s) return;
  const act = btn.dataset.act;
  // paid -> fee_due 0; reopen -> fee_due back to the configured monthly fee
  const next = act === "paid" ? 0 : (cfg().MONTHLY_FEE || 2000);
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      s.fee_due = next;
      state.store?.update(s.id, { fee_due: next });
    } else {
      const { error } = await state.sb.from(cfg().TABLE).update({ fee_due: next }).eq("id", s.id);
      if (error) throw error;
      s.fee_due = next; // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(act === "paid" ? `${s.student_name} — fee paid.` : `${s.student_name} — fee reopened.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new student enrolls a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", student_name: "Kavya Reddy", phone: "",
      class: "Class 10", batch: "Evening", fee_due: cfg().MONTHLY_FEE || 2000,
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.students = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`New enrollment — Kavya Reddy (Class 10, demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
