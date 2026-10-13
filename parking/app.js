/* ParkingQ — customer ticket page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoTickets } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const C = cfg();
const api = queueApi(C.APP || "parking", C.TABLE || "parking_tickets");

const state = { ticket: null, channel: null, store: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "CityPark"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inVehicle").addEventListener("input", () => clearInvalid("vehicle"));

function prettyTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/* ---------- submit ---------- */
$("#ticketForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const vehicle = $("#inVehicle").value.trim().toUpperCase();
  if (!setInvalid("vehicle", !vehicle)) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Issuing…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    const payload = {
      vehicle_no: vehicle,
      phone: $("#inPhone").value.trim() || null,
      check_in: new Date().toISOString(),
      check_out: null,
      amount: null,
    };
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this ticket, like the real backend.
      const store = state.store || demoStore(C.TABLE || "parking_tickets", demoTickets);
      state.store = store;
      row = { id: "demo-" + Date.now(), ...payload, created_at: payload.check_in };
      store.insert(row);
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(C.TABLE).insert([payload]).select().single();
      if (error) throw new Error("Could not issue ticket: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showTicket(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Get my ticket";
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

/* ---------- ticket view ---------- */
function showTicket(row) {
  state.ticket = row;
  $("#view-form").hidden = true;
  $("#view-ticket").hidden = false;
  renderTicket(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this ticket live via the shared demo store — the dashboard
    // (even in another tab) drives check-out, like the real backend.
    const store = state.store || demoStore(C.TABLE || "parking_tickets", demoTickets);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.ticket.id);
      if (r && (r.check_out !== state.ticket.check_out || r.amount !== state.ticket.amount)) {
        state.ticket = r;
        renderTicket(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = api.onRow(sb, row.id, (r) => { state.ticket = r; renderTicket(r); });
  });
}

function renderTicket(row) {
  $("#vehBig").textContent = row.vehicle_no || "–";
  const parked = !row.check_out;
  $("#inLine").innerHTML = parked
    ? "<strong>Parked now.</strong> Show this ticket at the exit."
    : "<strong>Checked out.</strong> Thanks for parking with us.";
  $("#dIn").textContent = prettyTime(row.check_in);
  $("#dOut").textContent = row.check_out ? prettyTime(row.check_out) : "—";
  $("#dAmt").textContent = row.amount != null ? "₹" + row.amount : (parked ? "Payable at exit" : "—");
  $("#dStatus").innerHTML = `<span class="st ${parked ? "parked" : "out"}">${parked ? "Parked" : "Checked out"}</span>`;
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.ticket = null;
  $("#ticketForm").reset();
  $("#view-ticket").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
