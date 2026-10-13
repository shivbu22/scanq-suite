/* ValetQ — customer valet request page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoRequests } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = queueApi(cfg().APP || "valet", cfg().TABLE || "valet_requests");

const state = { row: null, channel: null, store: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "ParkEasy Valet"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inCar").addEventListener("input", () => clearInvalid("car"));
$("#inName").addEventListener("input", () => clearInvalid("name"));

/* ---------- submit ---------- */
$("#valetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const car = $("#inCar").value.trim().toUpperCase();
  const name = $("#inName").value.trim();
  let ok = setInvalid("car", !car);
  ok = setInvalid("name", !name) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Requesting…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    const payload = {
      car_no: car,
      owner_name: name,
      phone: $("#inPhone").value.trim() || null,
      status: "requested",
    };
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this request, like the real backend.
      const store = demoStore(cfg().TABLE || "valet_requests", demoRequests);
      state.store = store;
      row = { id: "demo-" + Date.now(), ...payload, created_at: new Date().toISOString() };
      store.insert(row);
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(cfg().TABLE)
        .insert([payload])
        .select()
        .single();
      if (error) throw new Error("Could not request valet: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showTicket(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Request valet";
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
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-ticket").hidden = false;
  renderTicket(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this request live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.store || demoStore(cfg().TABLE || "valet_requests", demoRequests);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.row.id);
      if (r && r.status !== state.row.status) {
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
  $("#ticketPlate").textContent = row.car_no || "–";
  $("#dName").textContent = row.owner_name;

  const order = ["requested", "parked", "returned"];
  const idx = order.indexOf(row.status);
  $$("#timeline li").forEach((li) => {
    const s = li.dataset.s;
    const i = order.indexOf(s);
    const finished = row.status === "returned";
    li.classList.toggle("done", i < idx || (finished && i <= idx));
    li.classList.toggle("now", i === idx && !finished);
    li.querySelector(".dot").textContent = (i < idx || finished) ? "✓" : (i === idx ? "●" : "");
  });

  const pos = $("#queuePos");
  if (row.status === "requested") {
    pos.innerHTML = "<strong>Request received.</strong> Valet is on the way to your car.";
  } else if (row.status === "parked") {
    pos.innerHTML = "<strong>Your car is parked.</strong> Relax — we will bring it back when you are ready.";
  } else if (row.status === "returned") {
    pos.innerHTML = "<strong>Car returned.</strong> Drive safe, and thank you.";
  } else if (row.status === "cancelled") {
    pos.innerHTML = "<strong>Request cancelled.</strong>";
  }
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#valetForm").reset();
  $("#view-ticket").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
