/* FeedbackQ — shop owner dashboard logic (ratings inbox). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoFeedback } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const TABLE = cfg().TABLE || "feedback";

const state = { rows: [], tab: "new", muted: false, sb: null, store: null, knownIds: new Set() };

const STATUS_LABEL = { new: "New", acknowledged: "Acknowledged", resolved: "Resolved" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   PASSCODE GATE + DASHBOARD
   ================================================================ */
if (DEMO || sessionStorage.getItem("fq_admin") === "1") showDash();
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
    sessionStorage.setItem("fq_admin", "1");
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "feedback", fallback);
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
        app: cfg().APP || "feedback",
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
  $("#feedList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(TABLE, demoFeedback);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash(fresh.length ? fresh[0].id : null);
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`New feedback — ${fresh[0].rating} stars from ${fresh[0].name || "Anonymous"}`);
      }
    });
  } else {
    state.sb = await getClient();
    const { data, error } = await state.sb.from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast("Could not load feedback: " + error.message); return; }
    state.rows = data || [];
    state.sb
      .channel("feedback-live")
      .on("postgres_changes",
        { event: "*", schema: "public", table: TABLE },
        (p) => {
          applyChange(p);
          if (p.eventType === "INSERT" && !state.muted) chime();
          renderDash(p.eventType === "INSERT" ? p.new.id : null);
          if (p.eventType === "INSERT")
            toast(`New feedback — ${p.new.rating} stars from ${p.new.name || "Anonymous"}`);
        })
      .subscribe();
  }
  after();
}

function applyChange(p) {
  if (p.eventType === "INSERT") {
    if (!state.rows.some((r) => r.id === p.new.id)) state.rows.unshift(p.new);
  } else if (p.eventType === "UPDATE") {
    const i = state.rows.findIndex((r) => r.id === p.new.id);
    if (i >= 0) state.rows[i] = p.new;
  } else if (p.eventType === "DELETE") {
    state.rows = state.rows.filter((r) => r.id !== p.old.id);
  }
}

/* ---------- rendering ---------- */
function renderDash(flashId) {
  const rows = state.rows;
  const n = rows.length;
  const avg = n ? rows.reduce((s, r) => s + (r.rating || 0), 0) / n : null;
  const top = n ? Math.round((100 * rows.filter((r) => r.rating >= 4).length) / n) : null;

  $("#stAvg").textContent = avg == null ? "–" : avg.toFixed(1);
  $("#stTotal").textContent = n;
  $("#stTop").textContent = top == null ? "–" : top + "%";

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    acknowledged: rows.filter((r) => r.status === "acknowledged").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
  };
  $("#cNew").textContent = counts.new;
  $("#cAck").textContent = counts.acknowledged;
  $("#cRes").textContent = counts.resolved;

  const list = $("#feedList");
  const view = rows.filter((r) => (r.status || "new") === state.tab);

  if (!view.length) {
    const msg = {
      new: ["Inbox zero", "New feedback will appear here instantly."],
      acknowledged: ["Nothing acknowledged", "Tap “Acknowledge” on new feedback to park it here."],
      resolved: ["Nothing resolved yet", "Resolved feedback shows up here."],
    }[state.tab];
    list.innerHTML = `<div class="empty"><div class="big">${msg[0]}</div><div>${msg[1]}</div></div>`;
    return;
  }
  list.innerHTML = view.map(cardHTML).join("");
  if (flashId) {
    const el = list.querySelector(`[data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function starsView(n) {
  return `<span class="stars-view" role="img" aria-label="${n} out of 5 stars">` +
    `<span class="on">${"★".repeat(n)}</span><span class="off">${"★".repeat(5 - n)}</span></span>`;
}

function cardHTML(r) {
  const status = r.status || "new";
  let actions = "";
  if (status === "new") {
    actions = `<button class="btn primary small" data-act="ack" style="width:auto">Acknowledge</button>`;
  } else if (status === "acknowledged") {
    actions = `<button class="btn primary small" data-act="res" style="width:auto">Resolve</button>`;
  }
  return `<div class="qcard" data-id="${r.id}">
    <div class="fcard-top">
      <div class="fmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${starsView(r.rating || 0)}
          <span class="st ${status}">${STATUS_LABEL[status] || status}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)} · ${esc(r.name || "Anonymous")}</div>
        <div class="chips"><span class="chip accent">${esc(r.category || "Other")}</span></div>
        <div class="fcomment">${esc(r.comment)}</div>
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
  const next = { ack: "acknowledged", res: "resolved" }[btn.dataset.act];
  if (!next) return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.status = next;
      state.store?.update(row.id, { status: next });
    } else {
      const { error } = await state.sb.from(TABLE).update({ status: next }).eq("id", row.id);
      if (error) throw error;
      row.status = next; // realtime echo will confirm
    }
    renderDash();
    toast(next === "acknowledged" ? "Feedback acknowledged." : "Feedback resolved.");
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

window.__sqBoot = true;
