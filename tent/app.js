/* TentQ — customer booking page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABLE = cfg().TABLE || "tent_bookings";

const state = { row: null, channel: null, date: "", items: new Set() };

export function fmtDate(iso) {
  // "2026-10-18" -> "Sat, 18 Oct" — parse as local date, no TZ shift
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Sharma Tent House"));
renderDayChips();
renderItemPills();
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

function renderDayChips() {
  const wrap = $("#dayChips");
  const today = new Date();
  let html = "";
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dow = d.toLocaleDateString("en-IN", { weekday: "short" });
    const mon = d.toLocaleDateString("en-IN", { month: "short" });
    html += `<button type="button" class="daychip" data-date="${iso}" aria-pressed="false">
      <span class="d">${dow}</span><span class="n">${d.getDate()}</span><span class="m">${mon}</span>
    </button>`;
  }
  wrap.innerHTML = html;
  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-date]");
    if (!b) return;
    state.date = b.dataset.date;
    $$(".daychip", wrap).forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    clearInvalid("date");
  });
}

function renderItemPills() {
  const wrap = $("#itemPills");
  wrap.innerHTML = (cfg().ITEMS || []).map((it) =>
    `<button type="button" class="itempill" data-item="${esc(it)}" aria-pressed="false">${esc(it)}</button>`
  ).join("");
  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-item]");
    if (!b) return;
    const it = b.dataset.item;
    if (state.items.has(it)) { state.items.delete(it); b.setAttribute("aria-pressed", "false"); }
    else { state.items.add(it); b.setAttribute("aria-pressed", "true"); }
    clearInvalid("items");
  });
}

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));

/* ---------- submit ---------- */
$("#bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const items = (cfg().ITEMS || []).filter((it) => state.items.has(it));
  let ok = setInvalid("name", !name);
  ok = setInvalid("date", !state.date) && ok;
  ok = setInvalid("items", !items.length) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Booking…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    const payload = {
      customer_name: name,
      phone: $("#inPhone").value.trim() || null,
      event_date: state.date,
      items: items.join(", "),
      status: "booked",
    };
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this booking, like the real backend.
      const store = demoStore(TABLE, demoRows);
      row = {
        id: "demo-" + Date.now(),
        ...payload,
        created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.demoStore = store;
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(TABLE).insert([payload]).select().single();
      if (error) throw new Error("Could not create booking: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showBooking(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Book now";
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

/* ---------- booking view ---------- */
function showBooking(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-booking").hidden = false;
  $("#bookDate").textContent = fmtDate(row.event_date);
  $("#dName").textContent = row.customer_name;
  $("#dItems").textContent = row.items || "—";
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this booking live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.demoStore || demoStore(TABLE, demoRows);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.row.id);
      if (r && r.status !== state.row.status) {
        state.row = r;
        renderStatus(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = sb.channel(`tentq-${row.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: TABLE,
        filter: `id=eq.${row.id}`,
      }, (p) => { state.row = p.new; renderStatus(p.new); })
      .subscribe();
  });
}

function renderStatus(row) {
  $("#dStatus").innerHTML = `<span class="st ${row.status}">${esc((cfg().STATUS_LABELS || {})[row.status] || row.status)}</span>`;
  const line = {
    booked: "<strong>Booked.</strong> We will call to confirm the details.",
    done: "<strong>Done.</strong> Setup delivered. Thank you!",
    cancelled: "<strong>Cancelled.</strong> Please call us to rebook.",
  }[row.status] || "";
  $("#bookPos").innerHTML = line;
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null; state.date = ""; state.items = new Set();
  $("#bookForm").reset();
  $$(".daychip").forEach((x) => x.setAttribute("aria-pressed", "false"));
  $$(".itempill").forEach((x) => x.setAttribute("aria-pressed", "false"));
  $("#view-booking").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
