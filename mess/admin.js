/* MessCount — kitchen dashboard logic. Headcount only: no tokens, no board. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const TABLE = () => cfg().TABLE || "mess_rsvp";

const state = { rows: [], muted: false, sb: null };

const MEAL_LABEL = { lunch: "Lunch", dinner: "Dinner" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Mess"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "mess", fallback);
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
  $("#btnCopyLunch").onclick = () => copyList("lunch");
  $("#btnCopyDinner").onclick = () => copyList("dinner");
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: cfg().APP || "mess",
        getSb: getClient,
        fallbackHash: cfg().PASSCODE_HASH || "",
        toast,
      });
    }
  }
}

/* demo seed data lives in ./demo.js (shared with the customer page) */

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(TABLE(), demoRows);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash();
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`${fresh[0].name} — ${fresh[0].eating ? "eating" : "skipping"} ${MEAL_LABEL[fresh[0].meal] || ""}`);
      }
    });
    return;
  }
  state.sb = await getClient();
  const { data, error } = await state.sb.from(TABLE())
    .select("*")
    .eq("rsvp_date", todayISO())
    .order("created_at", { ascending: true });
  if (error) { toast("Could not load RSVPs: " + error.message); return; }
  state.rows = data || [];
  state.sb
    .channel("rsvp")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: TABLE(), filter: `rsvp_date=eq.${todayISO()}` },
      (p) => {
        if (!state.rows.some((r) => r.id === p.new.id)) state.rows.push(p.new);
        if (!state.muted) chime();
        renderDash();
        toast(`${p.new.name} — ${p.new.eating ? "eating" : "skipping"} ${MEAL_LABEL[p.new.meal] || ""}`);
      })
    .subscribe();
}

/* ---------- rendering ---------- */
function counts(meal) {
  const rows = state.rows.filter((r) => r.meal === meal);
  return {
    eat: rows.filter((r) => r.eating).length,
    skip: rows.filter((r) => !r.eating).length,
  };
}

function renderDash() {
  const l = counts("lunch"), d = counts("dinner");
  $("#lunchEat").textContent = l.eat;
  $("#lunchSkip").textContent = l.skip;
  $("#dinnerEat").textContent = d.eat;
  $("#dinnerSkip").textContent = d.skip;

  const box = $("#memberList");
  const groups = ["lunch", "dinner"].map((meal) => ({
    meal,
    rows: state.rows.filter((r) => r.meal === meal),
  })).filter((g) => g.rows.length);

  if (!groups.length) {
    box.innerHTML = `<div class="empty"><div class="big">No responses yet</div>` +
      `<div>Members' taps will appear here instantly.</div></div>`;
    return;
  }
  box.innerHTML = groups.map((g) => {
    const rows = g.rows.map((r) => `
      <div class="mrow">
        <span class="nm">${esc(r.name)}</span>
        <span class="tm">${timeAgo(r.created_at)}</span>
        <span class="pill ${r.eating ? "eat" : "skip"}">${r.eating ? "Eating" : "Skipping"}</span>
      </div>`).join("");
    const c = counts(g.meal);
    return `<h2 class="sec">${MEAL_LABEL[g.meal]} · ${c.eat} eating</h2>` +
      `<div class="card" style="padding:6px 18px">${rows}</div>`;
  }).join("");
}

/* ---------- copy list ---------- */
async function copyList(meal) {
  const names = state.rows
    .filter((r) => r.meal === meal && r.eating)
    .map((r) => r.name);
  if (!names.length) { toast("Nobody eating " + MEAL_LABEL[meal].toLowerCase() + " yet."); return; }
  const text = `${MEAL_LABEL[meal]} — ${names.length} eating (${todayISO()})\n` +
    names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(`${MEAL_LABEL[meal]} list copied (${names.length} names).`);
}

/* demo: a member taps in a few seconds after opening the preview.
   Goes through the shared store so every open tab sees the arrival. */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const row = {
      id: "demo-new", name: "Dev Patel", meal: "lunch", eating: true,
      rsvp_date: todayISO(), created_at: new Date().toISOString(),
    };
    state.store.insert(row);
    state.rows = state.store.read();
    state.knownIds.add(row.id);
    if (!state.muted) chime();
    renderDash();
    toast("Dev Patel — eating Lunch (demo arrival)");
  }, 6000);
}

window.__sqBoot = true;
