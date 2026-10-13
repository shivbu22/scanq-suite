/* PackersQ — packers staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoQuotes } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const TABLE = cfg().TABLE || "packer_quotes";

const state = { rows: [], tab: "new", muted: false, sb: null, channel: null };

const STATUS_LABEL = { ...(cfg().STATUS_LABELS || {}), cancelled: "Cancelled" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "SafeMove Packers"));
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "packers", fallback);
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
        app: cfg().APP || "packers",
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
  $("#queueList").addEventListener("click", onCardAction);
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(TABLE, demoQuotes);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        const f = fresh[0];
        toast(`${f.customer_name} — ${f.from_city} → ${f.to_city}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load requests: " + (e.message || e));
      return;
    }
    state.channel = state.sb
      .channel(TABLE + "-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE }, (p) => {
        applyRow(p.new);
        if (!state.muted) chime();
        renderDash(p.new.id);
        toast(`${p.new.customer_name} — ${p.new.from_city} → ${p.new.to_city}`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: TABLE }, (p) => {
        applyRow(p.new);
        renderDash();
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
function prettyDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function inTab(r) {
  if (state.tab === "new") return r.status === "new";
  if (state.tab === "pipeline") return r.status === "quoted" || r.status === "confirmed";
  return r.status === "done" || r.status === "cancelled";
}

function counts() {
  return {
    new: state.rows.filter((r) => r.status === "new").length,
    pipe: state.rows.filter((r) => r.status === "quoted" || r.status === "confirmed").length,
    done: state.rows.filter((r) => r.status === "done").length,
  };
}

function renderDash(flashId) {
  const c = counts();
  $("#stNew").textContent = c.new;
  $("#stPipe").textContent = c.pipe;
  $("#stDone").textContent = c.done;
  $("#stNew").closest(".stat").classList.toggle("hot", c.new > 0);
  $("#cNew").textContent = c.new;
  $("#cPipe").textContent = c.pipe;
  $("#cDone").textContent = c.done;

  const list = $("#queueList");
  const rows = state.rows
    .filter(inTab)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (!rows.length) {
    const msg = {
      new: ["No new requests", "Quote requests will appear here instantly."],
      pipeline: ["Pipeline is empty", "Quoted and confirmed moves show up here."],
      done: ["Nothing completed yet", "Finished and cancelled moves show up here."],
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
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";

  let actions = "";
  if (r.status === "new") {
    actions = `<button class="btn primary small" data-act="quote" style="width:auto">Mark quoted</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else if (r.status === "quoted") {
    actions = `<button class="btn primary small" data-act="confirm" style="width:auto">Confirm</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else if (r.status === "confirmed") {
    actions = `<button class="btn primary small" data-act="done" style="width:auto">Mark done</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status] || r.status}</span>
        </div>
        <div class="route" style="font-size:15px;margin-top:6px"><span>${esc(r.from_city || "—")}</span><span class="arrow">→</span><span>${esc(r.to_city || "—")}</span></div>
        <div class="qtime">${prettyDate(r.move_date)} · requested ${timeAgo(r.created_at)}${phone}</div>
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
  const next = { quote: "quoted", confirm: "confirmed", done: "done", cancel: "cancelled" }[btn.dataset.act];
  if (!next) return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.status = next;
      state.store?.update(row.id, { status: next });
    } else {
      const { error } = await state.sb.from(TABLE).update({ status: next }).eq("id", row.id);
      if (error) throw error;
      row.status = next; // optimistic; realtime echo will confirm
    }
    renderDash();
    const verb = { quoted: "quoted", confirmed: "confirmed", done: "completed", cancelled: "cancelled" }[next];
    toast(`${row.customer_name} — ${verb}.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

/* demo: a new customer walks in a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", customer_name: "Asha Nair", phone: "",
      from_city: "Kochi", to_city: "Bengaluru",
      move_date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
      status: "new",
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash(row.id);
    toast("Asha Nair — Kochi → Bengaluru (demo arrival)");
  }, 6000);
}

window.__sqBoot = true;
