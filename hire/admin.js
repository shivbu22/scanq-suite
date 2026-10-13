/* HireQ — owner dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows, demoRoles } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const api = queueApi(cfg().APP || "hire", cfg().TABLE || "hire_applications");
const ROLES_KEY = "hireq_roles";

const state = { rows: [], tab: "new", muted: false, sb: null, roles: [] };

const STATUS_LABEL = { ...(cfg().STATUS_LABELS || {}) };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "My Shop"));
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "hire", fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
}

async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  loadRoles();
  await boot(renderDash);
}

/* ---------- open roles (per device, localStorage) ---------- */
function loadRoles() {
  try {
    const raw = localStorage.getItem(ROLES_KEY);
    if (raw) {
      const r = JSON.parse(raw);
      if (Array.isArray(r)) { state.roles = r; renderRoles(); return; }
    }
  } catch (_) { /* fall through */ }
  state.roles = DEMO ? demoRoles() : (cfg().DEFAULT_ROLES || []);
  saveRoles();
}
function saveRoles() {
  try { localStorage.setItem(ROLES_KEY, JSON.stringify(state.roles)); } catch (_) { /* ignore */ }
}
function renderRoles() {
  const box = $("#rolesList");
  box.innerHTML = state.roles.length
    ? state.roles.map((r) => `
      <div class="role-row" data-role="${esc(r)}">
        <span>${esc(r)}</span>
        <button class="btn danger-text small" data-role-act="remove" style="width:auto">Remove</button>
      </div>`).join("")
    : `<div class="empty" style="padding:14px 0">No open roles — add one to start taking applications.</div>`;
}
$("#rolesList").addEventListener("click", (e) => {
  const btn = e.target.closest('[data-role-act="remove"]');
  if (!btn) return;
  const role = btn.closest("[data-role]").dataset.role;
  state.roles = state.roles.filter((r) => r !== role);
  saveRoles(); renderRoles();
  toast(`Role “${role}” removed.`);
});
function addRole() {
  const v = $("#inRole").value.trim();
  if (!v) return;
  if (state.roles.includes(v)) { toast("That role is already open."); return; }
  state.roles.push(v);
  saveRoles(); renderRoles();
  $("#inRole").value = "";
  toast(`Role “${v}” added — applicants see it on the form.`);
}
$("#btnAddRole").onclick = addRole;
$("#inRole").addEventListener("keydown", (e) => { if (e.key === "Enter") addRole(); });

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
        app: cfg().APP || "hire",
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
  $("#appList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the application
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(cfg().TABLE || "hire_applications", demoRows);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`New application — ${fresh[0].name} (${fresh[0].role})`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(cfg().TABLE)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load applications: " + (e.message || e));
      return;
    }
    api.onInsert(state.sb, (row, isUpdate) => {
      applyRow(row);
      const fresh = !isUpdate;
      if (fresh && !state.muted) chime();
      renderDash(fresh ? row.id : null);
      if (fresh) toast(`New application — ${row.name} (${row.role})`);
    });
  }
  after();
}

function applyRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i >= 0) state.rows[i] = row;
  else state.rows.unshift(row); // newest first
}

/* ---------- rendering ---------- */
function counts() {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  return {
    new: state.rows.filter((r) => r.status === "new").length,
    shortlisted: state.rows.filter((r) => r.status === "shortlisted").length,
    rejected: state.rows.filter((r) => r.status === "rejected").length,
    newWeek: state.rows.filter((r) => r.status === "new" && new Date(r.created_at).getTime() >= weekAgo).length,
    total: state.rows.length,
  };
}

function renderDash(flashId) {
  const c = counts();
  $("#stNewWeek").textContent = c.newWeek;
  $("#stShort").textContent = c.shortlisted;
  $("#stTotal").textContent = c.total;
  $("#stNewWeek").closest(".stat").classList.toggle("hot", c.new > 0);
  $("#cNew").textContent = c.new;
  $("#cShort").textContent = c.shortlisted;
  $("#cRej").textContent = c.rejected;

  const list = $("#appList");
  const rows = state.rows
    .filter((r) => r.status === state.tab)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!rows.length) {
    const msg = {
      new: ["No new applications", "New applications appear here instantly."],
      shortlisted: ["Nobody shortlisted yet", "Shortlist promising candidates to call them back."],
      rejected: ["Nobody rejected", "Rejected applications are kept here for reference."],
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

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0]).join("").toUpperCase();
}

function cardHTML(r) {
  const phone = r.phone
    ? `<a href="tel:${esc(r.phone)}" style="color:var(--brand-deep)">${esc(r.phone)}</a>`
    : "—";

  let actions = "";
  if (r.status === "new") {
    actions = `<button class="btn primary small" data-act="shortlist" style="width:auto">Shortlist</button>
      <button class="btn danger-text" data-act="reject">Reject</button>`;
  } else if (r.status === "shortlisted") {
    actions = `<button class="btn danger-text" data-act="reject">Reject</button>
      <button class="btn ghost small" data-act="reopen" style="width:auto">Move to new</button>`;
  } else if (r.status === "rejected") {
    actions = `<button class="btn primary small" data-act="shortlist" style="width:auto">Reconsider</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qava">${esc(initials(r.name))}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)} · 📞 ${phone}</div>
        <div class="chips">
          <span class="chip accent">${esc(r.role || "—")}</span>
          ${r.experience ? `<span class="chip">${esc(r.experience)}</span>` : ""}
        </div>
        ${r.note ? `<div class="qnote">${esc(r.note)}</div>` : ""}
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
  const next = { shortlist: "shortlisted", reject: "rejected", reopen: "new" }[btn.dataset.act];
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
    if (next === "shortlisted") toast(`${row.name} shortlisted — call them back.`);
    if (next === "rejected") toast(`${row.name} rejected.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

window.__sqBoot = true;
