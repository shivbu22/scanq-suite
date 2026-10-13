/* MuseumQ — customer e-ticket page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoTickets, dayISO } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const api = queueApi(C.APP || "museum", C.TABLE || "museum_tickets");
const MIN_T = C.MIN_TICKETS || 1;
const MAX_T = C.MAX_TICKETS || 20;
const DAYS = 14;

const state = { row: null, channel: null, dateISO: null, tickets: 2, store: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "City Museum"));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = C.SHOP_SUB || "E-tickets"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

renderDayChips();
selectDay(dayISO(0));
renderTicketCount();

function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    dow: dt.toLocaleDateString("en-IN", { weekday: "short" }),
    num: String(d),
    mon: dt.toLocaleDateString("en-IN", { month: "short" }),
  };
}

function renderDayChips() {
  const box = $("#dayChips");
  box.innerHTML = "";
  for (let i = 0; i < DAYS; i++) {
    const iso = dayISO(i);
    const l = dayLabel(iso);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slotchip";
    b.dataset.iso = iso;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span>${i === 0 ? "Today" : i === 1 ? "Tmrw" : l.dow}</span><small>${l.num} ${l.mon}</small>`;
    b.onclick = () => selectDay(iso);
    box.appendChild(b);
  }
}

function selectDay(iso) {
  state.dateISO = iso;
  $$("#dayChips .slotchip").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.iso === iso)));
  clearInvalid("date");
}

/* ---------- ticket stepper ---------- */
function renderTicketCount() {
  $("#tCount").textContent = state.tickets;
  $("#tMinus").disabled = state.tickets <= MIN_T;
  $("#tPlus").disabled = state.tickets >= MAX_T;
  clearInvalid("tickets");
}
$("#tMinus").onclick = () => { state.tickets = Math.max(MIN_T, state.tickets - 1); renderTicketCount(); };
$("#tPlus").onclick = () => { state.tickets = Math.min(MAX_T, state.tickets + 1); renderTicketCount(); };

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
}

/* ---------- submit ---------- */
$("#bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("date", !state.dateISO) && ok;
  ok = setInvalid("tickets", state.tickets < MIN_T) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Booking…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    const payload = {
      visitor_name: name,
      phone: $("#inPhone").value.trim() || null,
      visit_date: state.dateISO,
      tickets: state.tickets,
      used: false,
    };
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this booking, like the real backend.
      const store = state.store || demoStore(C.TABLE || "museum_tickets", demoTickets);
      state.store = store;
      row = { id: "demo-" + Date.now(), ...payload, created_at: new Date().toISOString() };
      store.insert(row);
    } else {
      const sb = await getClient();
      bar.style.width = "60%";
      const { data, error } = await sb.from(C.TABLE).insert([payload]).select().single();
      if (error) throw new Error("Could not book tickets: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showTicket(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Get my e-ticket";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

function fakeProgress(bar) {
  return new Promise((res) => {
    let w = 30;
    const h = setInterval(() => {
      w = Math.min(96, w + 16);
      bar.style.width = w + "%";
      if (w >= 96) { clearInterval(h); res(); }
    }, 150);
  });
}

/* ---------- e-ticket view ---------- */
function showTicket(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-booked").hidden = false;
  renderTicket(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this ticket live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.store || demoStore(C.TABLE || "museum_tickets", demoTickets);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.row.id);
      if (r && r.used !== state.row.used) {
        state.row = r;
        renderTicket(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = api.onRow(sb, row.id, (r) => { state.row = r; renderTicket(r); });
  });
}

function renderTicket(row) {
  $("#tickNum").textContent = row.tickets || 0;
  $("#tickDateLine").innerHTML = `for <strong>${esc(prettyDate(row.visit_date))}</strong>`;
  $("#dName").textContent = row.visitor_name;
  $("#dDate").textContent = prettyDate(row.visit_date);
  $("#dStatus").innerHTML = row.used
    ? `<span class="st used">Used — enjoy your visit</span><div style="margin-top:6px;font-size:13.5px;color:var(--muted)">Scanned at the gate. Have a wonderful time.</div>`
    : `<span class="st booked">Booked — show at the gate</span><div style="margin-top:6px;font-size:13.5px;color:var(--muted)">Show this e-ticket at the entry. ${esc(String(row.tickets || 0))} ticket(s) reserved.</div>`;
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null; state.tickets = 2;
  $("#bookForm").reset();
  selectDay(dayISO(0));
  renderTicketCount();
  $("#view-booked").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
