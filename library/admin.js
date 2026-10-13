/* LibraryQ — librarian dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();

const state = { rows: [], tab: "onloan", muted: false, sb: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "City Library"));
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
    state.passHash = await getPasscodeHash(sb, cfg().APP || "library", fallback);
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
        app: cfg().APP || "library",
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
  $("#loanList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the customer
    // page (even in another tab) and the dashboard see each other.
    state.store = demoStore(cfg().TABLE || "library_loans", demoRows);
    state.rows = state.store.read();
    state.knownIds = new Set(state.rows.map((r) => r.id));
    state.store.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownIds.has(r.id));
      state.rows = rows;
      fresh.forEach((r) => state.knownIds.add(r.id));
      renderDash();
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`New loan — ${fresh[0].book_title}`);
      }
    });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(cfg().TABLE)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load loans: " + (e.message || e));
      return;
    }
    state.channel = state.sb.channel("loans")
      .on("postgres_changes", { event: "*", schema: "public", table: cfg().TABLE },
        (payload) => {
          if (payload.eventType === "INSERT") {
            state.rows.unshift(payload.new);
            if (!state.muted) chime();
            renderDash();
            toast(`New loan — ${payload.new.book_title}`);
          } else if (payload.eventType === "UPDATE") {
            applyRow(payload.new);
            renderDash();
          }
        })
      .subscribe();
  }
  after();
}

function applyRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i >= 0) state.rows[i] = row;
  else state.rows.unshift(row);
}

/* ---------- rendering ---------- */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(r) {
  return !r.returned && (r.due_date || "") < todayISO();
}

function counts() {
  const onLoan = state.rows.filter((r) => !r.returned);
  const monthStart = todayISO().slice(0, 7);
  return {
    onLoan: onLoan.length,
    overdue: onLoan.filter(isOverdue).length,
    returned: state.rows.filter((r) => r.returned && (r.created_at || "").slice(0, 7) === monthStart).length,
  };
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function renderDash() {
  const c = counts();
  $("#stOnLoan").textContent = c.onLoan;
  $("#stOverdue").textContent = c.overdue;
  $("#stReturned").textContent = c.returned;
  $("#stOverdue").closest(".stat").classList.toggle("hot", c.overdue > 0);
  $("#cOnLoan").textContent = c.onLoan;
  $("#cReturned").textContent = state.rows.filter((r) => r.returned).length;

  const list = $("#loanList");
  const rows = state.rows
    .filter((r) => state.tab === "returned" ? r.returned : !r.returned)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  if (!rows.length) {
    const msg = {
      onloan: ["No books on loan", "New issues will appear here instantly."],
      returned: ["Nothing returned yet", "Returned books show up here."],
    }[state.tab];
    list.innerHTML = `<div class="empty"><div class="big">${msg[0]}</div><div>${msg[1]}</div></div>`;
    return;
  }
  list.innerHTML = rows.map(cardHTML).join("");
}

function cardHTML(r) {
  const overdue = isOverdue(r);
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";
  const statusChip = r.returned
    ? `<span class="st returned">Returned</span>`
    : overdue
      ? `<span class="st overdue">Overdue</span>`
      : `<span class="st onloan">On loan</span>`;

  const actions = !r.returned
    ? `<div class="qactions"><button class="btn primary small" data-act="return" style="width:auto">Mark returned</button></div>`
    : "";

  return `<div class="qcard lcard${overdue ? " overdue" : ""}" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.book_title)}</span>
          ${statusChip}
        </div>
        <div class="qtime">${esc(r.member_name)}${phone}</div>
        <div class="chips">
          <span class="chip">Due ${esc(fmtDate(r.due_date))}</span>
          <span class="chip">Issued ${esc(fmtDate(r.issued_date))}</span>
        </div>
      </div>
    </div>
    ${actions}
  </div>`;
}

/* ---------- actions ---------- */
async function onCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const row = state.rows.find((r) => r.id === card.dataset.id);
  if (!row || btn.dataset.act !== "return") return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.returned = true;
      state.store?.update(row.id, { returned: true });
    } else {
      const { error } = await state.sb.from(cfg().TABLE)
        .update({ returned: true })
        .eq("id", row.id);
      if (error) throw error;
      row.returned = true; // optimistic; realtime echo will confirm
    }
    renderDash();
    toast(`Returned — ${row.book_title}`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

window.__sqBoot = true;
