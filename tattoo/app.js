/* TattooQ — customer booking page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, fmtBytes, queueApi, uploadFile, demoStore,
} from "../shared/sq.js";
import { demoBookings, dayISO } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const api = queueApi(C.APP || "tattoo", C.TABLE || "tattoo_bookings");

const state = { booking: null, channel: null, dateISO: null, file: null, store: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "InkHouse Studio"));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = C.SHOP_SUB || "Tattoo appointments"));
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

/* ---------- reference image picker ---------- */
const dz = $("#dz"), inFile = $("#inFile"), chipBox = $("#fileChip");
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

function pickFile(f) {
  if (!f) return;
  if (!ACCEPT.includes(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) {
    toast("Only JPG or PNG photos, please.");
    return;
  }
  const max = (C.MAX_FILE_MB || 20) * 1024 * 1024;
  if (f.size > max) {
    toast(`That photo is over ${C.MAX_FILE_MB || 20} MB.`);
    return;
  }
  state.file = f;
  dz.hidden = true;
  chipBox.hidden = false;
  chipBox.innerHTML =
    `<div class="filechip"><div><div class="fn">${esc(f.name)}</div>` +
    `<div class="fs">${fmtBytes(f.size)}</div></div>` +
    `<button type="button" class="rm" aria-label="Remove photo">✕</button></div>`;
  chipBox.querySelector(".rm").onclick = () => {
    state.file = null; inFile.value = "";
    chipBox.hidden = true; dz.hidden = false;
  };
}
dz.addEventListener("click", () => inFile.click());
dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") inFile.click(); });
inFile.addEventListener("change", () => pickFile(inFile.files[0]));
["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
dz.addEventListener("drop", (e) => pickFile(e.dataTransfer.files[0]));

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

function prettyDateShort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
}

/* ---------- submit ---------- */
$("#bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("date", !state.dateISO) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Booking…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    const payload = {
      customer_name: name,
      phone: $("#inPhone").value.trim() || null,
      booking_date: state.dateISO,
      design_notes: $("#inNotes").value.trim() || null,
      status: "booked",
    };
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: no real uploads — the file stays local in this tab.
      const store = state.store || demoStore(C.TABLE || "tattoo_bookings", demoBookings);
      state.store = store;
      row = {
        id: "demo-" + Date.now(), ...payload,
        file_url: "",
        created_at: new Date().toISOString(),
      };
      store.insert(row);
    } else {
      const sb = await getClient();
      bar.style.width = "50%";
      let file_url = "";
      if (state.file) {
        file_url = await uploadFile(sb, state.file);
        bar.style.width = "75%";
      }
      const { data, error } = await sb.from(C.TABLE)
        .insert([{ ...payload, file_url }])
        .select()
        .single();
      if (error) throw new Error("Could not book session: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showBooking(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Book my session";
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
    const store = state.store || demoStore(C.TABLE || "tattoo_bookings", demoBookings);
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
  booked: "Booked — see you then.",
  done: "Done. Enjoy the ink.",
  cancelled: "Cancelled.",
};

function renderBooking(row) {
  $("#bookDateBig").textContent = prettyDateShort(row.booking_date);
  $("#bookDateLine").innerHTML = `<strong>${esc(prettyDate(row.booking_date))}</strong>`;
  $("#dName").textContent = row.customer_name;
  $("#dNotes").textContent = row.design_notes || "—";
  const label = { booked: "Booked", done: "Done", cancelled: "Cancelled" }[row.status] || row.status;
  $("#dStatus").innerHTML = `<span class="st ${row.status}">${label}</span><div style="margin-top:6px;font-size:13.5px;color:var(--muted)">${STATUS_TEXT[row.status] || ""}</div>`;
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.booking = null; state.file = null;
  $("#bookForm").reset();
  chipBox.hidden = true; dz.hidden = false;
  selectDay(dayISO(0));
  $("#view-booked").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
