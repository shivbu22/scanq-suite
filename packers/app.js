/* PackersQ — customer quote request page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoQuotes } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABLE = cfg().TABLE || "packer_quotes";

const state = { row: null, channel: null, dateISO: null, store: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "SafeMove Packers"));
renderDayChips();
selectDay(dayISO(0));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- moving date chips (next 60 days) ---------- */
function dayISO(i) {
  const t = new Date(Date.now() + i * 86400000);
  return t.toISOString().slice(0, 10);
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
function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}
function renderDayChips() {
  const box = $("#dayChips");
  box.innerHTML = "";
  for (let i = 0; i < 60; i++) {
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
$("#inFrom").addEventListener("input", () => clearInvalid("route"));
$("#inTo").addEventListener("input", () => clearInvalid("route"));

/* ---------- submit ---------- */
$("#tokenForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const from = $("#inFrom").value.trim();
  const to = $("#inTo").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("route", !from || !to) && ok;
  ok = setInvalid("date", !state.dateISO) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Sending…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this request, like the real backend.
      const store = demoStore(TABLE, demoQuotes);
      row = {
        id: "demo-" + Date.now(), customer_name: name,
        phone: $("#inPhone").value.trim() || null,
        from_city: from, to_city: to, move_date: state.dateISO,
        status: "new",
        created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.store = store;
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(TABLE)
        .insert([{
          customer_name: name,
          phone: $("#inPhone").value.trim() || null,
          from_city: from, to_city: to, move_date: state.dateISO,
          status: "new",
        }])
        .select()
        .single();
      if (error) throw new Error("Could not send request: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showToken(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Request my quote";
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

/* ---------- request view ---------- */
function showToken(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#dName").textContent = row.customer_name;
  $("#dFrom").textContent = row.from_city || "—";
  $("#dTo").textContent = row.to_city || "—";
  $("#dDate").textContent = row.move_date ? prettyDate(row.move_date) : "—";
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this request live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.store || demoStore(TABLE, demoQuotes);
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
    state.channel = sb
      .channel(TABLE + "-" + row.id)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: TABLE, filter: "id=eq." + row.id },
        (p) => { state.row = p.new; renderStatus(p.new); })
      .subscribe();
  });
}

function renderStatus(row) {
  const order = ["new", "quoted", "confirmed", "done"];
  const idx = order.indexOf(row.status);
  $$("#timeline li").forEach((li) => {
    const s = li.dataset.s;
    const i = order.indexOf(s);
    const finished = row.status === "done";
    li.classList.toggle("done", i < idx || (finished && i <= idx));
    li.classList.toggle("now", i === idx && !finished);
    li.querySelector(".dot").textContent = (i < idx || finished) ? "✓" : (i === idx ? "●" : "");
  });
  const pos = {
    new: "<strong>Request received.</strong> We will call you with a quote shortly.",
    quoted: "<strong>Quoted.</strong> Check your phone — we have shared your price.",
    confirmed: "<strong>Confirmed.</strong> Your move is booked. We will see you on moving day.",
    done: "<strong>Done.</strong> Moved. Welcome to your new home.",
    cancelled: "<strong>Cancelled.</strong> This request was cancelled.",
  };
  $("#queuePos").innerHTML = pos[row.status] || "";
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#tokenForm").reset();
  renderDayChips();
  selectDay(dayISO(0));
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
