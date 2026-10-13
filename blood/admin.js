/* BloodQ — camp staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const TABLE = cfg().TABLE || "blood_donors";
const GROUPS = cfg().BLOOD_GROUPS || [];

const state = { rows: [], group: "all", search: "", muted: false, sb: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "RedCross Camp"));
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "blood", fallback);
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
  renderDash();
  if (DEMO) simulateArrival();
}

function bindDash() {
  // blood-group tabs
  const tabs = $("#groupTabs");
  const all = [{ g: "all", label: "All" }, ...GROUPS.map((g) => ({ g, label: g }))];
  tabs.innerHTML = all.map(({ g, label }, i) =>
    `<button role="tab" data-group="${esc(g)}" aria-selected="${i === 0 ? "true" : "false"}">${esc(label)}<span class="c" data-count="${esc(g)}"></span></button>`
  ).join("");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-group]");
    if (!b) return;
    state.group = b.dataset.group;
    $$("#groupTabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    renderDash();
  });
  $("#inSearch").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderDash();
  });
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: cfg().APP || "blood",
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
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the donor
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
        toast(`${fresh[0].donor_name} (${fresh[0].blood_group}) registered`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(TABLE).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load donors: " + (e.message || e));
      return;
    }
    state.sb.channel(`bloodq-${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE }, (payload) => {
        applyRow(payload.new);
        if (!state.muted) chime();
        renderDash(payload.new.id);
        toast(`${payload.new.donor_name} (${payload.new.blood_group}) registered`);
      })
      .subscribe();
  }
}

function applyRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i >= 0) state.rows[i] = row;
  else state.rows.unshift(row);
}

/* ---------- rendering ---------- */
function filtered() {
  let rows = state.rows;
  if (state.group !== "all") rows = rows.filter((r) => r.blood_group === state.group);
  if (state.search) rows = rows.filter((r) => (r.donor_name || "").toLowerCase().includes(state.search));
  return rows.sort((a, b) => (b.created_at || "") < (a.created_at || "") ? -1 : 1);
}

function renderDash(flashId) {
  const total = state.rows.length;
  const today = state.rows.filter((r) => (r.created_at || "") >= todayISO()).length;
  const covered = new Set(state.rows.map((r) => r.blood_group).filter(Boolean)).size;
  $("#stTotal").textContent = total;
  $("#stToday").textContent = today;
  $("#stGroups").textContent = covered + " / " + GROUPS.length;

  const countFor = (g) => g === "all" ? total : state.rows.filter((r) => r.blood_group === g).length;
  $$("#groupTabs [data-count]").forEach((el) => {
    const n = countFor(el.dataset.count);
    el.textContent = n > 0 ? n : "";
  });

  const list = $("#donorList");
  const rows = filtered();
  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">No donors yet</div><div>Registrations will appear here instantly.</div></div>`;
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
  const last = r.last_donation
    ? new Date(r.last_donation + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "Never donated";
  const donorId = "BLD-" + String(r.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="gbadge">${esc(r.blood_group || "?")}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.donor_name)}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone} · ${esc(donorId)} · Last donation: ${esc(last)}</div>
      </div>
    </div>
  </div>`;
}

/* demo: a new donor registers a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", donor_name: "Kavya Reddy", phone: "",
      blood_group: "O+", last_donation: null,
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast("Kavya Reddy (O+) registered (demo arrival)");
  }, 6000);
}

window.__sqBoot = true;
