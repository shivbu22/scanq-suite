/* KiranaQ — shop owner dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex,
} from "../shared/sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const BOARD = params.get("display") === "1";
const DEMO = isDemo();
const TABLE = () => cfg().TABLE || "kirana_queue";

const state = { rows: [], tab: "queued", muted: false, sb: null };

const STATUS_LABEL = () => cfg().STATUS_LABELS || { queued: "Queued", active: "Packing", done: "Ready", cancelled: "Cancelled" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Store"));
if (!BOARD) {
  $("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
}
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   COUNTER DISPLAY BOARD (?display=1) — big order numbers for a TV
   ================================================================ */
if (BOARD) {
  $("#view-board").hidden = false;
  document.title = "Now packing — " + (cfg().SHOP_NAME || "");
  boot(boardTick);
}

async function boardTick() {
  renderBoard();
  if (DEMO || !isConfigured()) return;
  state.sb = state.sb || (await getClient());
  state.sb
    .channel("board")
    .on("postgres_changes",
      { event: "*", schema: "public", table: TABLE(),  },
      (p) => { applyChange(p); renderBoard(); })
    .subscribe();
}

function renderBoard() {
  const packing = state.rows.filter((r) => r.status === "active").sort((a, b) => a.token - b.token);
  const queued = state.rows.filter((r) => r.status === "queued").sort((a, b) => a.token - b.token);
  const main = $("#boardMain"), next = $("#boardNext");
  if (packing.length) {
    const cur = packing[0];
    main.innerHTML = `<div class="k">NOW PACKING</div><div class="n">${cur.token}</div>` +
      `<div class="who">${esc(cur.customer_name)}</div>`;
  } else if (queued.length) {
    main.innerHTML = `<div class="k">NEXT UP</div><div class="n">${queued[0].token}</div>` +
      `<div class="who">${esc(queued[0].customer_name)}</div>`;
  } else {
    main.innerHTML = `<div class="k">${esc((cfg().SHOP_NAME || "").toUpperCase())}</div>` +
      `<div class="idle" style="margin-top:24px">No orders in queue.<br />Scan the QR code at the counter to place one.</div>`;
  }
  const upcoming = queued.slice(packing.length ? 0 : 1, (packing.length ? 0 : 1) + 3);
  next.innerHTML = upcoming.length
    ? "Up next: " + upcoming.map((r) => `<strong>${r.token}</strong>`).join(" · ")
    : "";
}

/* ================================================================
   DASHBOARD
   ================================================================ */
if (!BOARD) {
  if (DEMO || sessionStorage.getItem(cfg().APP + "_admin") === "1") showDash();
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
  const want = cfg().PASSCODE_HASH || "";
  if (h === want) {
    sessionStorage.setItem(cfg().APP + "_admin", "1");
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

function demoRows() {
  const t = Date.now();
  const mk = (mins, token, customer_name, items, status) => ({
    id: "demo-" + token, created_at: new Date().toISOString(), token,
    customer_name, phone: "", details: { items }, status,
    created_at: new Date(t - mins * 60000).toISOString(),
  });
  return [
    mk(2, 24, "Arjun Nair", ["Biscuits", "Detergent 1kg"], "queued"),
    mk(4, 21, "Meera Shah", ["Atta 5kg", "Sugar 1kg", "Tea 250g"], "queued"),
    mk(9, 22, "Rahul Verma", ["Milk 1L", "Bread", "Eggs (12)"], "queued"),
    mk(14, 23, "Fatima Khan", ["Rice 5kg", "Toor Dal 1kg", "Salt 1kg", "Mustard Oil 1L"], "active"),
    mk(40, 20, "Sunita Rao", ["Atta 5kg", "Milk 1L"], "done"),
  ];
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    state.rows = demoRows();
  } else {
    state.sb = await getClient();
    const { data, error } = await state.sb.from(TABLE())
      .select("*").gte("created_at", todayISO())
      .order("token", { ascending: true });
    if (error) { toast("Could not load queue: " + error.message); return; }
    state.rows = data || [];
    state.sb
      .channel("queue")
      .on("postgres_changes",
        { event: "*", schema: "public", table: TABLE(),  },
        (p) => {
          applyChange(p);
          if (p.eventType === "INSERT" && !state.muted) chime();
          if (BOARD) renderBoard(); else renderDash(p.eventType === "INSERT" ? p.new.id : null);
          if (p.eventType === "INSERT" && !BOARD)
            toast(`Order ${p.new.token} — ${p.new.customer_name}`);
        })
      .subscribe();
  }
  after();
}

function applyChange(p) {
  if (p.eventType === "INSERT") {
    if (!state.rows.some((r) => r.id === p.new.id)) state.rows.push(p.new);
  } else if (p.eventType === "UPDATE") {
    const i = state.rows.findIndex((r) => r.id === p.new.id);
    if (i >= 0) state.rows[i] = p.new;
  } else if (p.eventType === "DELETE") {
    state.rows = state.rows.filter((r) => r.id !== p.old.id);
  }
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
  $("#stQueued").textContent = c.queued;
  $("#stPacking").textContent = c.active;
  $("#stReady").textContent = c.done;
  $("#stQueued").closest(".stat").classList.toggle("hot", c.queued > 0);
  $("#cQueued").textContent = c.queued;
  $("#cPacking").textContent = c.active;
  $("#cDone").textContent = c.done;

  const list = $("#queueList");
  let rows = state.rows.filter((r) =>
    state.tab === "done"
      ? r.status === "done" || r.status === "cancelled"
      : r.status === state.tab);
  rows.sort((a, b) => a.token - b.token);

  if (!rows.length) {
    const msg = {
      queued: ["Queue is clear", "New orders will appear here instantly."],
      active: ["Nothing being packed", "Use “Call next order” or start one manually."],
      done: ["Nothing finished yet", "Ready and cancelled orders show up here."],
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
  const items = (r.details || {}).items || [];
  const chips = items.map((it) => `<span class="chip">${esc(it)}</span>`).join("");
  const phone = r.phone ? ` · ${esc(r.phone)}` : "";
  const labels = STATUS_LABEL();

  let actions = "";
  if (r.status === "queued") {
    actions = `<button class="btn primary small" data-act="pack" style="width:auto">Start packing</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else if (r.status === "active") {
    actions = `<button class="btn primary small" data-act="ready" style="width:auto">Mark ready</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken">${r.token}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${esc(labels[r.status] || r.status)}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone} · ${items.length} item${items.length === 1 ? "" : "s"}</div>
        <div class="chips">${chips}</div>
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
  const next = { pack: "active", ready: "done", cancel: "cancelled" }[btn.dataset.act];
  if (!next) return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.status = next;
    } else {
      const { error } = await state.sb.from(TABLE()).update({ status: next }).eq("id", row.id);
      if (error) throw error;
      row.status = next; // realtime echo will confirm; optimistic for snappiness
    }
    renderDash();
    if (next === "active") toast(`Order ${row.token} is being packed.`);
    if (next === "done") toast(`Order ${row.token} is ready for pickup.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
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
      const { error } = await state.sb.from(TABLE()).update({ status: "active" }).eq("id", next.id);
      if (error) throw error;
      next.status = "active";
    }
    if (state.tab !== "queued") {
      state.tab = "queued";
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === "queued" ? "true" : "false"));
    }
    renderDash();
    toast(`Order ${next.token} — ${next.customer_name} — is being packed.`);
  } catch (err) {
    toast("Could not advance queue: " + (err.message || err));
  }
}

/* demo: a new customer walks in a few seconds after opening the preview */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const n = Math.max(...state.rows.map((r) => r.token)) + 1;
    state.rows.push({
      id: "demo-new", created_at: new Date().toISOString(), token: n,
      customer_name: "Dev Patel", phone: "",
      details: { items: ["Atta 5kg", "Biscuits"] },
      status: "queued", created_at: new Date().toISOString(),
    });
    if (!state.muted) chime();
    renderDash("demo-new");
    toast(`Order ${n} — Dev Patel (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
