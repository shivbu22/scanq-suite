/* ServiceQ — shop owner dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, queueApi, signedUrl, shortFileName, fmtBytes,
} from "../shared/sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const SL = C.STATUS_LABELS || {};
const params = new URLSearchParams(location.search);
const BOARD = params.get("display") === "1";
const DEMO = isDemo();

const state = { rows: [], tab: "queued", muted: false, sb: null };

const STATUS_LABEL = {
  queued: SL.queued || "Received",
  active: SL.active || "Repairing",
  done: SL.done || "Ready",
  cancelled: "Cancelled",
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-app-name]").forEach((el) => (el.textContent = C.APP_NAME || "ServiceQ"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   COUNTER DISPLAY BOARD (?display=1) — big job numbers for a TV
   ================================================================ */
if (BOARD) {
  $("#view-board").hidden = false;
  document.title = "Now repairing — " + (C.SHOP_NAME || "");
  boot(boardTick);
}

async function boardTick() {
  renderBoard();
  if (DEMO || !isConfigured()) return;
  state.sb = state.sb || (await getClient());
  const api = queueApi(C.APP, C.TABLE);
  api.onInsert(state.sb, (row) => {
    const i = state.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) state.rows[i] = row; else state.rows.push(row);
    renderBoard();
  });
}

function renderBoard() {
  const active = state.rows.filter((r) => r.status === "active").sort((a, b) => a.token - b.token);
  const waiting = state.rows.filter((r) => r.status === "queued").sort((a, b) => a.token - b.token);
  const main = $("#boardMain"), next = $("#boardNext");
  if (active.length) {
    const cur = active[0];
    main.innerHTML = `<div class="k">REPAIRING NOW</div><div class="n">${cur.token}</div>` +
      `<div class="who">${esc(cur.customer_name)}</div>`;
  } else if (waiting.length) {
    main.innerHTML = `<div class="k">NEXT UP</div><div class="n">${waiting[0].token}</div>` +
      `<div class="who">${esc(waiting[0].customer_name)}</div>`;
  } else {
    main.innerHTML = `<div class="k">${esc((C.SHOP_NAME || "").toUpperCase())}</div>` +
      `<div class="idle" style="margin-top:24px">No jobs in queue.<br />Scan the QR code at the counter to report your device.</div>`;
  }
  const upcoming = waiting.slice(active.length ? 0 : 1, (active.length ? 0 : 1) + 3);
  next.innerHTML = upcoming.length
    ? "Up next: " + upcoming.map((r) => `<strong>${r.token}</strong>`).join(" · ")
    : "";
}

/* ================================================================
   DASHBOARD
   ================================================================ */
if (!BOARD) {
  if (DEMO || sessionStorage.getItem("sq_admin") === "1") showDash();
  else {
    $("#view-lock").hidden = false;
    $("#inPass").focus();
  }
  $("#btnUnlock").onclick = tryUnlock;
  $("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
}

async function tryUnlock() {
  const v = $("#inPass").value.trim();
  if (!v) return;
  const h = await sha256hex(v);
  if (h === (C.PASSCODE_HASH || "")) {
    sessionStorage.setItem("sq_admin", "1");
    showDash();
  } else {
    $("#passErr").style.display = "block";
    $("#inPass").value = "";
    $("#inPass").focus();
  }
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
  $("#btnNext").onclick = callNext;
  $("#btnMute").onclick = () => {
    state.muted = !state.muted;
    $("#btnMute").textContent = state.muted ? "Sound off" : "Sound on";
    $("#btnMute").setAttribute("aria-pressed", String(!state.muted));
  };
  $("#queueList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    state.rows = demoJobs();
  } else {
    state.sb = await getClient();
    const api = queueApi(C.APP, C.TABLE);
    try {
      state.rows = await api.today(state.sb);
    } catch (error) {
      toast("Could not load queue: " + (error.message || error));
      return;
    }
    api.onInsert(state.sb, (row, isUpdate) => {
      const i = state.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) state.rows[i] = row; else state.rows.push(row);
      if (!isUpdate && !state.muted) chime();
      if (BOARD) renderBoard(); else renderDash(!isUpdate ? row.id : null);
      if (!isUpdate && !BOARD) toast(`Job ${row.token} — ${row.customer_name}`);
    });
  }
  after();
}

/* ---------- rendering ---------- */
function counts() {
  return {
    queued: state.rows.filter((r) => r.status === "queued").length,
    active: state.rows.filter((r) => r.status === "active").length,
    done: state.rows.filter((r) => r.status === "done" || r.status === "cancelled").length,
  };
}

function renderDash(flashId) {
  const c = counts();
  $("#stWaiting").textContent = c.waiting;
  $("#stPrinting").textContent = c.printing;
  $("#stDone").textContent = c.done;
  $("#stWaiting").closest(".stat").classList.toggle("hot", c.waiting > 0);
  $("#cWaiting").textContent = c.waiting;
  $("#cPrinting").textContent = c.printing;
  $("#cDone").textContent = c.done;

  const list = $("#queueList");
  const rows = state.rows
    .filter((r) =>
      state.tab === "done"
        ? r.status === "done" || r.status === "cancelled"
        : r.status === state.tab)
    .sort((a, b) => a.token - b.token);

  if (!rows.length) {
    const msg = {
      queued: ["No jobs waiting", "New reports will appear here instantly."],
      active: ["Bench is empty", "Use “Call next job” or start one manually."],
      done: ["Nothing finished yet", "Ready and cancelled jobs show up here."],
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
  const d = r.details || {};
  const device = d.device ? `<span class="chip accent">${esc(d.device)}</span>` : "";
  const issue = d.issue ? `<div class="qnote">“${esc(d.issue)}”</div>` : "";
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";
  const photo = r.file_url
    ? `<div class="qfile"><span class="fn">${esc(shortFileName(r.file_name || "photo"))}</span>` +
      `<span class="fs">${fmtBytes(r.file_size_bytes)}</span></div>`
    : "";

  let actions = "";
  if (r.status === "queued") {
    actions =
      (r.file_url ? `<button class="btn ghost small" data-act="dl">Photo</button>` : "") +
      `<button class="btn primary small" data-act="print" style="width:auto">Start repair</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else if (r.status === "active") {
    actions =
      (r.file_url ? `<button class="btn ghost small" data-act="dl">Photo</button>` : "") +
      `<button class="btn primary small" data-act="done" style="width:auto">Mark ready</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else if (r.file_url) {
    actions = `<button class="btn ghost small" data-act="dl">Photo</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken">${r.token}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone}</div>
        <div class="chips">${device}</div>
        ${issue}
        ${photo}
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

  if (btn.dataset.act === "dl") return downloadPhoto(row, btn);
  const next = { print: "active", done: "done", cancel: "cancelled" }[btn.dataset.act];
  if (!next) return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.status = next;
    } else {
      await queueApi(C.APP, C.TABLE).update(state.sb, row.id, { status: next });
      row.status = next;
    }
    renderDash();
    if (next === "active") toast(`Job ${row.token} is now being repaired.`);
    if (next === "done") toast(`Job ${row.token} is ready.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

async function downloadPhoto(row, btn) {
  if (DEMO || !isConfigured() || !row.file_url) { toast("Demo preview — no photo to download."); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Preparing…";
  try {
    const url = await signedUrl(state.sb, row.file_url, 3600);
    window.open(url, "_blank", "noopener");
  } catch (err) {
    toast("Download failed: " + (err.message || err));
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

async function callNext() {
  const next = state.rows
    .filter((r) => r.status === "queued")
    .sort((a, b) => a.token - b.token)[0];
  if (!next) { toast("Nobody is waiting."); return; }
  try {
    if (DEMO || !isConfigured()) next.status = "active";
    else {
      await queueApi(C.APP, C.TABLE).update(state.sb, next.id, { status: "active" });
      next.status = "active";
    }
    if (state.tab !== "queued") {
      state.tab = "queued";
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === "queued" ? "true" : "false"));
    }
    renderDash();
    toast(`Job ${next.token} — ${next.customer_name} — is now being repaired.`);
  } catch (err) {
    toast("Could not advance queue: " + (err.message || err));
  }
}

/* ---------- demo data ---------- */
function demoJobs() {
  const now = Date.now();
  const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
  return [
    { id: "demo-1", token: 11, customer_name: "Priya Nair", phone: "98111 22334", status: "active",
      details: { device: "Redmi Note 12", issue: "Cracked display — touch still works" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0, created_at: iso(55) },
    { id: "demo-2", token: 12, customer_name: "Dev Patel", phone: "", status: "queued",
      details: { device: "iPhone 11", issue: "Battery drains in under 2 hours" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0, created_at: iso(21) },
    { id: "demo-3", token: 13, customer_name: "Karan Joshi", phone: "", status: "queued",
      details: { device: "Samsung M34", issue: "Charging port feels loose" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0, created_at: iso(12) },
    { id: "demo-4", token: 10, customer_name: "Anita Rao", phone: "", status: "done",
      details: { device: "OnePlus 9", issue: "Back glass shattered" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0, created_at: iso(150) },
  ];
}

/* demo: a new customer walks in a few seconds after opening the preview */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const n = Math.max(...state.rows.map((r) => r.token)) + 1;
    state.rows.push({
      id: "demo-new", token: n, customer_name: "Neha Verma", phone: "",
      status: "queued",
      details: { device: "OnePlus Nord", issue: "Speaker crackling on calls" },
      note: null, file_url: "", file_name: "", file_size_bytes: 0,
      created_at: new Date().toISOString(),
    });
    if (!state.muted) chime();
    renderDash("demo-new");
    toast(`Job ${n} — Neha Verma (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
