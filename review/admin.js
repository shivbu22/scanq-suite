/* ReviewQ — owner dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABLE = cfg().TABLE || "review_taps";
const APP = cfg().APP || "review";
const GOOGLE_URL_KEY = "reviewq_google_url";
const DEMO = isDemo();

const state = { rows: [], sb: null, passHash: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Sharma Sweets"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   PASSCODE LOCK
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
    state.passHash = await getPasscodeHash(sb, APP, fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
}

/* ================================================================
   DASHBOARD
   ================================================================ */
async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  await boot();
  renderDash();
}

function bindDash() {
  const btnPass = $("#btnPasscode");
  if (DEMO || !isConfigured()) {
    btnPass.hidden = true; // nowhere to save it without the backend
  } else {
    btnPass.onclick = () => openPasscodeModal({
      app: APP,
      getSb: getClient,
      fallbackHash: cfg().PASSCODE_HASH || "",
      toast,
    });
  }
  // Google review URL setting (stored on this device).
  $("#inGurl").value = localStorage.getItem(GOOGLE_URL_KEY) || "";
  $("#btnSaveUrl").onclick = () => {
    const v = $("#inGurl").value.trim();
    if (v) localStorage.setItem(GOOGLE_URL_KEY, v);
    else localStorage.removeItem(GOOGLE_URL_KEY);
    toast(v ? "Google review link saved." : "Google review link cleared.");
  };
  $("#btnTestUrl").onclick = (e) => {
    e.preventDefault();
    const v = (localStorage.getItem(GOOGLE_URL_KEY) || "").trim();
    if (!v) { toast("Save a Google review link first."); return; }
    window.open(v, "_blank", "noopener");
  };
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(TABLE, demoRows);
    state.rows = state.store.read();
    state.store.onChange((rows) => { state.rows = rows; renderDash(); });
  } else {
    state.sb = await getClient();
    try {
      state.rows = await loadRows(state.sb);
    } catch (e) {
      toast("Could not load taps: " + (e.message || e));
      return;
    }
    state.sb.channel(TABLE + "-inserts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE },
        (p) => { state.rows.unshift(p.new); renderDash(); })
      .subscribe();
  }
}

async function loadRows(sb) {
  const since = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb.from(TABLE)
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/* ---------- stats ---------- */
const SEVEN_D = 7 * 24 * 3600 * 1000;

function rows7d() {
  const cut = Date.now() - SEVEN_D;
  return state.rows.filter((r) => new Date(r.created_at).getTime() >= cut);
}

function stats() {
  const today = new Date().toDateString();
  const todayRows = state.rows.filter((r) => new Date(r.created_at).toDateString() === today);
  const w = rows7d();
  const avg = w.length ? w.reduce((s, r) => s + (r.stars || 0), 0) / w.length : 0;
  return { today: todayRows.length, total: state.rows.length, avg, avgN: w.length };
}

function renderDash() {
  const s = stats();
  $("#stToday").textContent = s.today;
  $("#stTotal").textContent = s.total;
  $("#stAvg").textContent = s.avgN ? s.avg.toFixed(1) + " ★" : "–";
  $("#stToday").closest(".stat").classList.toggle("hot", s.today > 0);
  renderChart();
  renderTaps();
}

function dayKey(d) {
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

function renderChart() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  const byDay = {};
  for (const r of rows7d()) {
    const k = dayKey(new Date(r.created_at));
    (byDay[k] = byDay[k] || []).push(r);
  }
  const max = Math.max(1, ...days.map((d) => (byDay[dayKey(d)] || []).length));
  const names = ["S", "M", "T", "W", "T", "F", "S"];
  $("#chart").innerHTML = days.map((d, i) => {
    const rows = byDay[dayKey(d)] || [];
    const h = Math.round((rows.length / max) * 100);
    const today = i === 6;
    const avg = rows.length
      ? (rows.reduce((s, r) => s + (r.stars || 0), 0) / rows.length).toFixed(1)
      : null;
    return `<div class="bar${today ? " today" : ""}" title="${esc(d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }))}: ${rows.length} taps${avg ? ", avg " + avg + "★" : ""}">
      <div class="c">${rows.length}</div>
      <i style="height:${h}%"></i>
      <div class="d">${names[d.getDay()]}</div>
    </div>`;
  }).join("");
}

function starsStr(n) {
  return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
}

function renderTaps() {
  const rows = [...state.rows]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 12);
  $("#tapList").innerHTML = rows.length
    ? rows.map((r) => `<div class="tap">
        <span class="s">${starsStr(r.stars || 0)}</span>
        <span class="t">${timeAgo(r.created_at)}</span>
      </div>`).join("")
    : `<div class="empty"><div class="big">No taps yet</div><div>Share the customer link — taps will appear here instantly.</div></div>`;
}

window.__sqBoot = true;
