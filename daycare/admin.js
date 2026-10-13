/* DaycareQ — daycare staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoCheckins } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();

const state = { kids: [], tab: "inside", muted: false, sb: null, store: null, knownIds: new Set() };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Little Stars Daycare"));
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "daycare", fallback);
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
        app: cfg().APP || "daycare",
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
  $("#kidList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(cfg().TABLE || "daycare_checkins", demoCheckins);
    state.kids = state.store.read();
    state.knownIds = new Set(state.kids.map((k) => k.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.kids = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`Checked in — ${fresh[0].child_name}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(cfg().TABLE)
        .select("*").order("check_in", { ascending: false });
      if (error) throw error;
      state.kids = data || [];
    } catch (e) {
      toast("Could not load check-ins: " + (e.message || e));
      return;
    }
    state.sb.channel("daycare-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: cfg().TABLE }, (p) => {
        applyKid(p.new, p.eventType);
        renderDash(p.eventType === "INSERT" ? p.new.id : null);
        if (p.eventType === "INSERT" && !state.muted) chime();
      })
      .subscribe();
  }
  after();
}

function applyKid(row, eventType) {
  if (eventType === "DELETE") {
    state.kids = state.kids.filter((k) => k.id !== row.id);
    return;
  }
  const i = state.kids.findIndex((k) => k.id === row.id);
  if (i >= 0) state.kids[i] = row;
  else state.kids.push(row);
}

/* ---------- rendering ---------- */
function inside(k) { return !k.check_out; }

function renderDash(flashId) {
  const nIn = state.kids.filter(inside).length;
  const nOut = state.kids.filter((k) => !inside(k)).length;
  $("#stInside").textContent = nIn;
  $("#stInside").closest(".stat").classList.toggle("hot", nIn > 0);
  $("#stOut").textContent = nOut;
  $("#stTotal").textContent = state.kids.length;
  $("#cInside").textContent = nIn;
  $("#cOut").textContent = nOut;

  const list = $("#kidList");
  const rows = state.kids
    .filter((k) => state.tab === "inside" ? inside(k) : !inside(k))
    .sort((a, b) => new Date(b.check_in) - new Date(a.check_in));

  if (!rows.length) {
    const msg = state.tab === "inside"
      ? ["Nobody inside", "New check-ins will appear here instantly."]
      : ["No check-outs yet", "Children picked up today will show up here."];
    list.innerHTML = `<div class="empty"><div class="big">${msg[0]}</div><div>${msg[1]}</div></div>`;
    return;
  }
  list.innerHTML = rows.map(cardHTML).join("");
  if (flashId) {
    const el = list.querySelector(`[data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function cardHTML(k) {
  const isIn = inside(k);
  const phone = k.phone ? ` · ${esc(k.phone)}` : "";
  const actions = isIn
    ? `<button class="btn primary small" data-act="out" style="width:auto">Check out</button>`
    : "";

  return `<div class="qcard" data-id="${k.id}">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:22px">⭐</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(k.child_name)}</span>
          <span class="st ${isIn ? "inside" : "out"}">${isIn ? "Inside" : "Checked out"}</span>
        </div>
        <div class="qtime">${esc(k.parent_name || "")}${phone} · in ${timeAgo(k.check_in)}${k.check_out ? ` · out ${timeAgo(k.check_out)}` : ""}</div>
        ${k.note ? `<div class="chips"><span class="chip accent">${esc(k.note)}</span></div>` : ""}
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
  const k = state.kids.find((x) => x.id === card.dataset.id);
  if (!k || !inside(k)) return;
  const outAt = new Date().toISOString();
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      k.check_out = outAt;
      state.store?.update(k.id, { check_out: outAt });
    } else {
      const { error } = await state.sb.from(cfg().TABLE).update({ check_out: outAt }).eq("id", k.id);
      if (error) throw error;
      k.check_out = outAt; // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(`${k.child_name} — checked out.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a parent checks a child in a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", child_name: "Aarav Kapoor", parent_name: "Rahul Kapoor",
      phone: "", note: "", check_in: new Date().toISOString(), check_out: null,
    };
    state.store.insert(row);
    state.kids = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast(`Checked in — Aarav Kapoor (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
