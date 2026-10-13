/* SocietyQ — society staff dashboard logic (dues, complaints, visitors). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoDues, demoComplaints, demoVisitors } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const DEMO = isDemo();
const T = C.TABLES || { dues: "society_dues", complaints: "society_complaints", visitors: "society_visitors" };

const state = { tab: "dues", muted: false, sb: null, stores: {}, knownIds: new Set(), dues: [], complaints: [], visitors: [] };

const STATUS_LABEL = { ...(C.STATUS_LABELS || {}) };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Greenview Society"));
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
  const fallback = C.PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, C.APP || "society", fallback);
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
        app: C.APP || "society",
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
  $("#dashList").addEventListener("click", onCardAction);
}

function storeFor(key, seedFn) {
  if (!state.stores[key]) state.stores[key] = demoStore(T[key] || key, seedFn);
  return state.stores[key];
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in shared demo stores so the resident
    // page (even in another tab) and the dashboard see each other.
    const dues = storeFor("dues", demoDues);
    const comp = storeFor("complaints", demoComplaints);
    const vis = storeFor("visitors", demoVisitors);
    const pull = () => {
      state.dues = dues.read();
      state.complaints = comp.read();
      state.visitors = vis.read();
    };
    pull();
    state.knownIds = new Set([...state.dues, ...state.complaints, ...state.visitors].map((r) => r.id));
    const changed = (rows, prev) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      rows.forEach((r) => state.knownIds.add(r.id));
      return fresh;
    };
    const rerender = (label) => (rows) => {
      const fresh = changed(rows, label);
      pull();
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length && !state.muted) chime();
      if (fresh.length) toast(label(fresh[0]));
    };
    dues.onChange(rerender((r) => `New due — ${r.flat_no} ${money(r.amount)}`));
    comp.onChange(rerender((r) => `New complaint — ${r.category}, flat ${r.flat_no}`));
    vis.onChange(rerender((r) => `Visitor in — ${r.visitor_name} → ${r.flat_no}`));
  } else {
    state.sb = await getClient();
    try {
      const [d, c, v] = await Promise.all([
        state.sb.from(T.dues).select("*").order("created_at", { ascending: false }),
        state.sb.from(T.complaints).select("*").order("created_at", { ascending: false }),
        state.sb.from(T.visitors).select("*").order("check_in", { ascending: false }).limit(100),
      ]);
      if (d.error) throw d.error;
      if (c.error) throw c.error;
      if (v.error) throw v.error;
      state.dues = d.data || [];
      state.complaints = c.data || [];
      state.visitors = v.data || [];
    } catch (e) {
      toast("Could not load data: " + (e.message || e));
      return;
    }
    const watch = (table, apply) => {
      state.sb.channel("soc-" + table)
        .on("postgres_changes", { event: "*", schema: "public", table }, (p) => {
          const fresh = p.eventType === "INSERT";
          apply(p.new ?? p.old, p.eventType);
          if (fresh && !state.muted) chime();
          renderDash(fresh ? (p.new || {}).id : null);
        })
        .subscribe();
    };
    watch(T.dues, (row, ev) => applyRow(state.dues, row, ev));
    watch(T.complaints, (row, ev) => applyRow(state.complaints, row, ev));
    watch(T.visitors, (row, ev) => applyRow(state.visitors, row, ev));
  }
  renderDash();
}

function applyRow(list, row, ev) {
  if (ev === "DELETE") return;
  const i = list.findIndex((r) => r.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
}

function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

/* ---------- rendering ---------- */
function renderDash(flashId) {
  const unpaid = state.dues.filter((r) => !r.paid);
  const openC = state.complaints.filter((r) => r.status !== "resolved");
  const inside = state.visitors.filter((r) => !r.check_out);
  $("#stDue").textContent = unpaid.length;
  $("#stOpen").textContent = openC.length;
  $("#stInside").textContent = inside.length;
  $("#cDues").textContent = unpaid.length;
  $("#cComplaints").textContent = openC.length;
  $("#cVisitors").textContent = inside.length;

  const list = $("#dashList");
  let rows, html;
  if (state.tab === "dues") {
    rows = [...state.dues].sort((a, b) => (a.flat_no || "").localeCompare(b.flat_no || ""));
    html = rows.length ? rows.map(dueCard).join("") : emptyMsg("No dues recorded", "Dues added by the office will show up here.");
  } else if (state.tab === "complaints") {
    rows = [...state.complaints].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    html = rows.length ? rows.map(complaintCard).join("") : emptyMsg("No complaints", "Resident complaints will appear here instantly.");
  } else {
    rows = [...state.visitors].sort((a, b) => (a.check_in < b.check_in ? 1 : -1)).slice(0, 50);
    html = rows.length ? rows.map(visitorCard).join("") : emptyMsg("No visitors today", "Gate entries will appear here instantly.");
  }
  list.innerHTML = html;
  if (flashId) {
    const el = list.querySelector(`[data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function emptyMsg(big, small) {
  return `<div class="empty"><div class="big">${big}</div><div>${small}</div></div>`;
}

function dueCard(r) {
  const actions = r.paid
    ? `<button class="btn danger-text" data-act="unpay">Mark unpaid</button>`
    : `<button class="btn primary small" data-act="pay" style="width:auto">Mark paid</button>`;
  return `<div class="qcard" data-id="${r.id}" data-kind="dues">
    <div class="qcard-top">
      <div class="qtoken" style="font-size:22px">${esc(r.flat_no || "–")}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.month || "")}</span>
          <span class="st ${r.paid ? "paid" : "unpaid"}">${r.paid ? "Paid" : "Unpaid"}</span>
        </div>
        <div class="qtime">${esc(r.resident_name || "")} · ${money(r.amount)}</div>
      </div>
    </div>
    <div class="qactions">${actions}</div>
  </div>`;
}

function complaintCard(r) {
  let actions = "";
  if (r.status === "open") {
    actions = `<button class="btn primary small" data-act="start" style="width:auto">Start work</button>`;
  } else if (r.status === "in_progress") {
    actions = `<button class="btn primary small" data-act="resolve" style="width:auto">Resolve</button>`;
  } else {
    actions = `<button class="btn danger-text" data-act="reopen">Reopen</button>`;
  }
  return `<div class="qcard" data-id="${r.id}" data-kind="complaints">
    <div class="qcard-top">
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.category || "")} · ${esc(r.flat_no || "")}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="qtime">${esc(r.resident_name || "")} · ${timeAgo(r.created_at)}</div>
        <div style="font-size:14px;margin-top:4px">${esc(r.description || "")}</div>
      </div>
    </div>
    <div class="qactions">${actions}</div>
  </div>`;
}

function visitorCard(r) {
  const inside = !r.check_out;
  const actions = inside
    ? `<button class="btn primary small" data-act="checkout" style="width:auto">Check out</button>`
    : "";
  return `<div class="qcard" data-id="${r.id}" data-kind="visitors">
    <div class="qcard-top">
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.visitor_name || "")}</span>
          <span class="st ${inside ? "inside" : "left"}">${inside ? "Inside" : "Left"}</span>
        </div>
        <div class="qtime">Flat ${esc(r.flat_no || "")}${r.purpose ? " · " + esc(r.purpose) : ""} · in ${timeAgo(r.check_in)}${r.check_out ? " · out " + timeAgo(r.check_out) : ""}</div>
      </div>
    </div>
    ${actions ? `<div class="qactions">${actions}</div>` : ""}
  </div>`;
}

/* ---------- actions ---------- */
async function persist(kind, id, patch) {
  if (DEMO || !isConfigured()) {
    storeFor(kind, { dues: demoDues, complaints: demoComplaints, visitors: demoVisitors }[kind]).update(id, patch);
  } else {
    const { error } = await state.sb.from(T[kind]).update(patch).eq("id", id);
    if (error) throw error;
  }
  const list = { dues: state.dues, complaints: state.complaints, visitors: state.visitors }[kind];
  const row = list.find((r) => r.id === id);
  if (row) Object.assign(row, patch);
}

async function onCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const kind = card.dataset.kind;
  const id = card.dataset.id;
  const act = btn.dataset.act;
  const patch =
    act === "pay" ? { paid: true } :
    act === "unpay" ? { paid: false } :
    act === "start" ? { status: "in_progress" } :
    act === "resolve" ? { status: "resolved" } :
    act === "reopen" ? { status: "open" } :
    act === "checkout" ? { check_out: new Date().toISOString() } : null;
  if (!patch) return;
  btn.disabled = true;
  try {
    await persist(kind, id, patch);
    renderDash();
    toast("Updated.");
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

window.__sqBoot = true;
