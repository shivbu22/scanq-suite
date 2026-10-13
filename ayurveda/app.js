/* AyurvedaQ — customer appointment booking logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoVisits } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const SL = C.STATUS_LABELS || {};

const state = { visit: null, channel: null, dateISO: null, demoStore: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Ayush Ayurveda"));
$("#inConcern").innerHTML = (C.CONCERNS || []).map((s) => `<option>${esc(s)}</option>`).join("");
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

renderDayChips();
selectDay(dayISO(0));

/* ---------- visit day chips (next 7 days) ---------- */
function dayISO(i) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
}
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
    b.className = "daychip";
    b.dataset.iso = iso;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span>${i === 0 ? "Today" : l.dow}</span><small>${l.num} ${l.mon}</small>`;
    b.onclick = () => selectDay(iso);
    box.appendChild(b);
  }
}
function selectDay(iso) {
  state.dateISO = iso;
  $$("#dayChips .daychip").forEach((b) =>
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
$("#inConcern").addEventListener("change", () => clearInvalid("concern"));

/* ---------- submit ---------- */
$("#bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const concern = $("#inConcern").value;
  let ok = setInvalid("name", !name);
  ok = setInvalid("concern", !concern) && ok;
  ok = setInvalid("date", !state.dateISO) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Booking…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      const store = demoStore(C.TABLE || "ayurveda_visits", demoVisits);
      row = {
        id: "demo-" + Date.now(),
        patient_name: name,
        phone: $("#inPhone").value.trim() || null,
        visit_date: state.dateISO,
        treatment: concern,
        followup_date: null,
        status: "booked",
        created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.demoStore = store;
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(C.TABLE)
        .insert([{
          patient_name: name,
          phone: $("#inPhone").value.trim() || null,
          visit_date: state.dateISO,
          treatment: concern,
          status: "booked",
        }])
        .select()
        .single();
      if (error) throw new Error("Could not book: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showBooked(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Book appointment";
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

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* ---------- confirmation view ---------- */
function showBooked(row) {
  state.visit = row;
  $("#view-form").hidden = true;
  $("#view-booked").hidden = false;
  $("#apptDay").textContent = fmtDate(row.visit_date);
  $("#apptSub").innerHTML = `<strong>${esc(row.patient_name)}.</strong> See you at the clinic.`;
  $("#dName").textContent = row.patient_name;
  $("#dConcern").textContent = row.treatment || "—";
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    const store = state.demoStore || demoStore(C.TABLE || "ayurveda_visits", demoVisits);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.visit.id);
      if (r && (r.status !== state.visit.status || r.followup_date !== state.visit.followup_date)) {
        state.visit = r;
        renderStatus(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = sb.channel("ayurveda-visit-" + row.id)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public",
        table: C.TABLE || "ayurveda_visits",
        filter: `id=eq.${row.id}`,
      }, (p) => { state.visit = p.new; renderStatus(p.new); })
      .subscribe();
  });
}

function renderStatus(row) {
  const chip = $("#dStatus");
  chip.textContent = SL[row.status] || row.status;
  chip.classList.toggle("done", row.status === "done");
  if (row.followup_date) {
    $("#rowFollowup").hidden = false;
    $("#dFollowup").textContent = fmtDate(row.followup_date);
  } else {
    $("#rowFollowup").hidden = true;
  }
  if (row.status === "done") {
    $("#apptSub").innerHTML = `<strong>Visit done.</strong> Take care, see you at your follow-up.`;
  } else if (row.status === "cancelled") {
    $("#apptSub").innerHTML = `<strong>Cancelled.</strong> Book again anytime.`;
  }
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.visit = null;
  $("#bookForm").reset();
  renderDayChips();
  selectDay(dayISO(0));
  $("#view-booked").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
