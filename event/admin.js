/* EventQ — host dashboard logic. RSVP list + gate check-in. No tokens, no board. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const DEMO = isDemo();
const TABLE = () => cfg().TABLE || "event_rsvp";

const state = { rows: [], muted: false, sb: null, query: "" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "EventQ"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) document.querySelectorAll("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ---------- passcode gate ---------- */
if (DEMO || sessionStorage.getItem(cfg().APP + "_admin") === "1") showDash();
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
    sessionStorage.setItem(cfg().APP + "_admin", "1");
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "event", fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
}

/* ---------- dashboard ---------- */
async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  await boot();
  renderDash();
  if (DEMO) simulateArrival();
}

function bindDash() {
  $("#btnMute").onclick = () => {
    state.muted = !state.muted;
    $("#btnMute").textContent = state.muted ? "Sound off" : "Sound on";
    $("#btnMute").setAttribute("aria-pressed", String(!state.muted));
  };
  $("#inSearch").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderDash();
  });
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: cfg().APP || "event",
        getSb: getClient,
        fallbackHash: cfg().PASSCODE_HASH || "",
        toast,
      });
    }
  }
  $("#guestList").addEventListener("click", onGuestAction);
}

/* demo seed data lives in ./demo.js (shared with the RSVP page) */

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the RSVP page
    // (even in another tab) and the dashboard see each other.
    state.store = demoStore(TABLE(), demoRows);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      state.rows = rows;
      renderDash();
    });
    return;
  }
  state.sb = await getClient();
  const { data, error } = await state.sb.from(TABLE())
    .select("*")
    .order("created_at", { ascending: true });
  if (error) { toast("Could not load RSVPs: " + error.message); return; }
  state.rows = data || [];
  state.sb
    .channel("event-rsvp")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: TABLE() },
      (p) => {
        if (!state.rows.some((r) => r.id === p.new.id)) state.rows.push(p.new);
        if (!state.muted) chime();
        renderDash();
        toast(`${p.new.guest_name} — RSVP for ${p.new.headcount}`);
      })
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: TABLE() },
      (p) => {
        const i = state.rows.findIndex((r) => r.id === p.new.id);
        if (i >= 0) state.rows[i] = p.new;
        renderDash();
      })
    .subscribe();
}

/* ---------- rendering ---------- */
function renderDash() {
  const rows = state.rows;
  const expected = rows.reduce((n, r) => n + (r.headcount || 0), 0);
  const checked = rows.filter((r) => r.checked_in).reduce((n, r) => n + (r.headcount || 0), 0);
  $("#stExpected").textContent = expected;
  $("#stChecked").textContent = checked;
  $("#stRsvp").textContent = rows.length;

  const q = state.query;
  const list = rows.filter((r) =>
    !q || (r.guest_name || "").toLowerCase().includes(q) ||
    (r.event_name || "").toLowerCase().includes(q));

  const box = $("#guestList");
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="big">${
      q ? "No matches" : "No RSVPs yet"}</div>` +
      `<div>${q ? "Try a different name." : "RSVPs will appear here instantly."}</div></div>`;
    return;
  }
  box.innerHTML = `<div class="card" style="padding:6px 18px">` + list.map((r) => `
    <div class="guest${r.checked_in ? " in" : ""}" data-id="${r.id}">
      <div class="ginfo">
        <div class="gname">${esc(r.guest_name)}</div>
        <div class="gsub">${esc(r.event_name || "")}${r.phone ? " · " + esc(r.phone) : ""} · ${timeAgo(r.created_at)}</div>
      </div>
      <span class="hc">+${r.headcount || 1}</span>
      <button class="btn ${r.checked_in ? "ghost" : "primary"} small checkbtn" data-act="checkin" style="width:auto">${
        r.checked_in ? "Undo" : "Check in"}</button>
    </div>`).join("") + `</div>`;
}

/* ---------- gate check-in ---------- */
async function onGuestAction(e) {
  const btn = e.target.closest("[data-act='checkin']");
  if (!btn) return;
  const row = state.rows.find((r) => r.id === btn.closest("[data-id]").dataset.id);
  if (!row) return;
  const next = !row.checked_in;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      state.store?.update(row.id, { checked_in: next });
      state.rows = state.store.read();
    } else {
      const { error } = await state.sb.from(TABLE()).update({ checked_in: next }).eq("id", row.id);
      if (error) throw error;
      row.checked_in = next; // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(next
      ? `${row.guest_name} checked in (+${row.headcount || 1})`
      : `${row.guest_name} check-in undone`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* demo: a guest RSVPs a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", event_name: "Sharma Wedding", guest_name: "Dev Patel",
      phone: "", headcount: 2, checked_in: false,
      created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    if (!state.muted) chime();
    renderDash();
    toast("Dev Patel — RSVP for 2 (demo arrival)");
  }, 6000);
}

window.__sqBoot = true;
