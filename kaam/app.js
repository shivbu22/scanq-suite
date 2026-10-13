/* KaamQ — booking page logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABLE = cfg().TABLE || "kaam_jobs";
const q = queueApi(cfg().APP || "kaam", TABLE); // realtime channels + updates (table-generic)

const state = { row: null, channel: null, store: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "KaamQ Home Services"));
$("#inService").innerHTML = `<option value="" disabled selected>Select a service</option>` +
  (cfg().SERVICES || []).map((s) => `<option>${esc(s)}</option>`).join("");
$("#inSlot").innerHTML = `<option value="" disabled selected>Select a time slot</option>` +
  (cfg().TIME_SLOTS || []).map((s) => `<option>${esc(s)}</option>`).join("");
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- phone helpers ---------- */
function normPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
const validPhone = (v) => normPhone(v).length === 10;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`#view-form [data-f="${key}"], #view-track [data-f="${key}"]`)?.classList.toggle("invalid", bad);
  return !bad;
}
["inName", "inPhone", "inService", "inAddress", "inSlot"].forEach((id) =>
  $("#" + id).addEventListener("input", (e) => e.target.closest(".field").classList.remove("invalid")));
$("#inTrackPhone").addEventListener("input", (e) => e.target.closest(".field").classList.remove("invalid"));

/* ---------- views ---------- */
function show(id) {
  ["view-form", "view-confirm", "view-track"].forEach((v) => ($("#" + v).hidden = v !== id));
  window.scrollTo({ top: 0 });
}
$("#btnTrack").onclick = () => show("view-track");
$("#btnBack").onclick = () => show("view-form");
$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#bookForm").reset();
  show("view-form");
};

/* ---------- submit ---------- */
$("#bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const phone = normPhone($("#inPhone").value);
  const service = $("#inService").value;
  const address = $("#inAddress").value.trim();
  const slot = $("#inSlot").value;

  let ok = setInvalid("name", !name);
  ok = setInvalid("phone", !validPhone($("#inPhone").value)) && ok;
  ok = setInvalid("service", !service) && ok;
  ok = setInvalid("address", !address) && ok;
  ok = setInvalid("slot", !slot) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Booking…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this booking, like the real backend.
      const store = demoStore(TABLE, demoRows);
      row = {
        id: "demo-" + Date.now(), customer_name: name, phone,
        service, address, preferred_time: slot, technician: "",
        status: "queued", created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.store = store;
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(TABLE)
        .insert([{
          customer_name: name, phone, service, address,
          preferred_time: slot,
        }])
        .select()
        .single();
      if (error) throw new Error("Could not create booking: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showConfirm(row);
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

/* ---------- confirmation ---------- */
function showConfirm(row) {
  state.row = row;
  show("view-confirm");
  $("#refCode").textContent = String(row.id).slice(0, 8).toUpperCase();
  $("#dName").textContent = row.customer_name;
  $("#dService").textContent = row.service || "—";
  $("#dSlot").textContent = row.preferred_time || "—";
  $("#dTech").textContent = row.technician || "Not assigned yet";
  renderStatus(row);

  if (isDemo()) {
    // Follow this booking live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.store || demoStore(TABLE, demoRows);
    state.store = store;
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.row.id);
      if (r && (r.status !== state.row.status || r.technician !== state.row.technician)) {
        state.row = r;
        $("#dTech").textContent = r.technician || "Not assigned yet";
        renderStatus(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = q.onRow(sb, row.id, (r) => {
      state.row = r;
      $("#dTech").textContent = r.technician || "Not assigned yet";
      renderStatus(r);
    });
  });
}

function renderStatus(row) {
  const order = ["queued", "assigned", "arrived", "done"];
  const idx = order.indexOf(row.status);
  $$("#timeline li").forEach((li) => {
    const i = order.indexOf(li.dataset.s);
    const finished = row.status === "done";
    li.classList.toggle("done", i < idx || (finished && i <= idx));
    li.classList.toggle("now", i === idx && !finished);
    li.querySelector(".dot").textContent = (i < idx || finished) ? "✓" : (i === idx ? "●" : "");
  });
  $("#confLine").innerHTML = row.status === "done"
    ? "<strong>Job completed.</strong> Thanks for using KaamQ."
    : row.status === "cancelled"
      ? "<strong>Booking cancelled.</strong> Call us to rebook."
      : "<strong>We are on it.</strong> Your technician will call before leaving.";
}

/* ---------- track by phone ---------- */
$("#trackForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = normPhone($("#inTrackPhone").value);
  if (!setInvalid("tphone", !validPhone($("#inTrackPhone").value))) return;
  $("#trackResults").innerHTML = `<div class="card"><p class="sub" style="margin:0">Searching…</p></div>`;
  try {
    let rows;
    if (isDemo() || !isConfigured()) {
      const store = state.store || demoStore(TABLE, demoRows);
      state.store = store;
      rows = store.read();
    } else {
      const sb = await getClient();
      const { data, error } = await sb.from(TABLE)
        .select("*").gte("created_at", todayISO()).order("created_at", { ascending: false });
      if (error) throw error;
      rows = data;
    }
    const mine = rows.filter((r) => normPhone(r.phone) === phone);
    renderTrackResults(mine);
  } catch (err) {
    $("#trackResults").innerHTML = `<div class="card"><p class="sub" style="margin:0">Could not search: ${esc(err.message || err)}</p></div>`;
  }
});

const ORDER = ["queued", "assigned", "arrived", "done"];
function renderTrackResults(rows) {
  const box = $("#trackResults");
  if (!rows.length) {
    box.innerHTML = `<div class="empty"><div class="big">No bookings found</div><div>Try the number you booked with.</div></div>`;
    return;
  }
  box.innerHTML = rows.map((r) => {
    const idx = ORDER.indexOf(r.status);
    const steps = ORDER.map((s, i) => {
      const cls = r.status === "done" ? "done" : i < idx ? "done" : i === idx ? "now" : "";
      const mark = (i < idx || r.status === "done") ? "✓" : i === idx ? "●" : "";
      const label = { queued: "Received", assigned: "Assigned" + (r.technician ? ` · ${esc(r.technician)}` : ""), arrived: "Arrived", done: "Done" }[s];
      return `<li data-s="${s}" class="${cls}"><span class="dot">${mark}</span><div><div class="t">${label}</div></div></li>`;
    }).join("");
    return `<div class="card" style="margin-bottom:12px">
      <div class="kv"><span class="k">Ref</span><span class="v"><strong>${esc(String(r.id).slice(0, 8).toUpperCase())}</strong></span></div>
      <div class="kv"><span class="k">Service</span><span class="v">${esc(r.service || "—")}</span></div>
      <div class="kv"><span class="k">When</span><span class="v">${esc(r.preferred_time || "—")}</span></div>
      <ul class="timeline" style="margin-top:10px">${steps}</ul>
    </div>`;
  }).join("");
}

window.__sqBoot = true;
