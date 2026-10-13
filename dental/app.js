/* DentalQ — customer booking page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoVisits, dayISO } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const api = queueApi(C.APP || "dental", C.TABLE || "dental_visits");

const state = { booking: null, channel: null, dateISO: null, store: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "BrightSmile Dental"));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = C.SHOP_SUB || "Dental appointments"));
$("#inTreatment").innerHTML = (C.TREATMENTS || []).map((s) => `<option>${esc(s)}</option>`).join("");
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

renderDayChips();
selectDay(dayISO(0));

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
  for (let i = 0; i < 7; i++) {
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
  $$("#dayChips .slotchip").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.iso === iso)));
  clearInvalid("date");
}

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inTreatment").addEventListener("change", () => clearInvalid("treatment"));

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function shortDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

/* ---------- submit ---------- */
$("#bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const treatment = $("#inTreatment").value;
  let ok = setInvalid("name", !name);
  ok = setInvalid("treatment", !treatment) && ok;
  ok = setInvalid("date", !state.dateISO) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Booking…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    const payload = {
      patient_name: name,
      phone: $("#inPhone").value.trim() || null,
      visit_date: state.dateISO,
      treatment,
      status: "booked",
    };
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this booking, like the real backend.
      const store = state.store || demoStore(C.TABLE || "dental_visits", demoVisits);
      state.store = store;
      row = { id: "demo-" + Date.now(), ...payload, created_at: new Date().toISOString() };
      store.insert(row);
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(C.TABLE).insert([payload]).select().single();
      if (error) throw new Error("Could not book visit: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showBooking(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Book my visit";
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
function showBooking(row) {
  state.booking = row;
  $("#view-form").hidden = true;
  $("#view-booked").hidden = false;
  renderBooking(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this booking live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.store || demoStore(C.TABLE || "dental_visits", demoVisits);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.booking.id);
      if (r && r.status !== state.booking.status) {
        state.booking = r;
        renderBooking(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = api.onRow(sb, row.id, (r) => { state.booking = r; renderBooking(r); });
  });
}

const STATUS_TEXT = {
  booked: "Booked — see you at the clinic.",
  done: "Done. Thanks for coming.",
  cancelled: "Cancelled.",
  no_show: "Marked as no-show.",
};

function renderBooking(row) {
  $("#visitDayBig").textContent = shortDay(row.visit_date);
  $("#visitDateLine").innerHTML = `<strong>${esc(prettyDate(row.visit_date))}</strong>`;
  $("#dName").textContent = row.patient_name;
  $("#dTreatment").textContent = row.treatment || "—";
  const label = { booked: "Booked", done: "Done", cancelled: "Cancelled", no_show: "No-show" }[row.status] || row.status;
  $("#dStatus").innerHTML = `<span class="st ${row.status}">${label}</span><div style="margin-top:6px;font-size:13.5px;color:var(--muted)">${STATUS_TEXT[row.status] || ""}</div>`;
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.booking = null;
  $("#bookForm").reset();
  selectDay(dayISO(0));
  $("#view-booked").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
