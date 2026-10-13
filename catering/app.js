/* CateringQ — customer order page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoOrders, dayISO } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const api = queueApi(C.APP || "catering", C.TABLE || "catering_orders");

const GMIN = C.GUEST_MIN || 50, GMAX = C.GUEST_MAX || 2000, GSTEP = C.GUEST_STEP || 50;
const DAYS = 60;

const state = { order: null, channel: null, dateISO: null, guests: 500, store: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "CateringQ"));
$("#inMenu").innerHTML = (C.MENUS || []).map((s) => `<option>${esc(s)}</option>`).join("");
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

renderDateChips();
selectDay(dayISO(0));
renderGuests();

function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    dow: dt.toLocaleDateString("en-IN", { weekday: "short" }),
    num: String(d),
    mon: dt.toLocaleDateString("en-IN", { month: "short" }),
  };
}

function renderDateChips() {
  const box = $("#dateChips");
  box.innerHTML = "";
  for (let i = 0; i < DAYS; i++) {
    const iso = dayISO(i);
    const l = dayLabel(iso);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slotchip";
    b.dataset.iso = iso;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span>${i === 0 ? "Today" : l.dow}</span><small>${l.num} ${l.mon}</small>`;
    b.onclick = () => selectDay(iso);
    box.appendChild(b);
  }
}

function selectDay(iso) {
  state.dateISO = iso;
  $$("#dateChips .slotchip").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.iso === iso)));
  clearInvalid("date");
}

/* ---------- guest stepper ---------- */
function renderGuests() {
  $("#guestVal").textContent = state.guests;
  $("#btnMinus").disabled = state.guests <= GMIN;
  $("#btnPlus").disabled = state.guests >= GMAX;
  clearInvalid("guests");
}
$("#btnMinus").onclick = () => { state.guests = Math.max(GMIN, state.guests - GSTEP); renderGuests(); };
$("#btnPlus").onclick = () => { state.guests = Math.min(GMAX, state.guests + GSTEP); renderGuests(); };

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inMenu").addEventListener("change", () => clearInvalid("menu"));

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
}

/* ---------- submit ---------- */
$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const menu = $("#inMenu").value;
  let ok = setInvalid("name", !name);
  ok = setInvalid("date", !state.dateISO) && ok;
  ok = setInvalid("guests", state.guests < GMIN || state.guests > GMAX) && ok;
  ok = setInvalid("menu", !menu) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Booking…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    const payload = {
      customer_name: name,
      phone: $("#inPhone").value.trim() || null,
      event_date: state.dateISO,
      guests: state.guests,
      menu,
      status: "booked",
    };
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this order, like the real backend.
      const store = state.store || demoStore(C.TABLE || "catering_orders", demoOrders);
      state.store = store;
      row = { id: "demo-" + Date.now(), ...payload, created_at: new Date().toISOString() };
      store.insert(row);
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(C.TABLE).insert([payload]).select().single();
      if (error) throw new Error("Could not place order: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showOrder(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Book my catering";
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

/* ---------- confirmation view ---------- */
function showOrder(row) {
  state.order = row;
  $("#view-form").hidden = true;
  $("#view-order").hidden = false;
  renderOrder(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this order live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.store || demoStore(C.TABLE || "catering_orders", demoOrders);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.order.id);
      if (r && r.status !== state.order.status) {
        state.order = r;
        renderOrder(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = api.onRow(sb, row.id, (r) => { state.order = r; renderOrder(r); });
  });
}

const STATUS_TEXT = {
  booked: "Booked — we will call back shortly with the quote.",
  done: "Done. Thanks for celebrating with us.",
  cancelled: "Cancelled.",
};

function renderOrder(row) {
  $("#ordGuests").textContent = row.guests || "–";
  $("#ordDate").innerHTML = `<strong>${esc(prettyDate(row.event_date))}</strong>`;
  $("#dName").textContent = row.customer_name;
  $("#dMenu").textContent = row.menu || "—";
  const label = { booked: "Booked", done: "Done", cancelled: "Cancelled" }[row.status] || row.status;
  $("#dStatus").innerHTML = `<span class="st ${row.status}">${label}</span><div style="margin-top:6px;font-size:13.5px;color:var(--muted)">${STATUS_TEXT[row.status] || ""}</div>`;
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.order = null;
  $("#orderForm").reset();
  selectDay(dayISO(0));
  state.guests = 500; renderGuests();
  $("#view-order").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
