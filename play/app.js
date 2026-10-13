/* PlayQ — customer check-in page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoEntries } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const api = queueApi(cfg().APP || "play", cfg().TABLE || "play_entries");

const state = { row: null, channel: null, demoStore: null, ticker: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "FunZone Play Area"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inPhone").addEventListener("input", () => clearInvalid("phone"));

/* ---------- submit ---------- */
$("#entryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const phone = $("#inPhone").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("phone", !phone) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Checking in…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this check-in, like the real backend.
      const store = demoStore(cfg().TABLE || "play_entries", demoEntries);
      row = {
        id: "demo-" + Date.now(), child_name: name, parent_phone: phone,
        check_in: new Date().toISOString(), check_out: null,
      };
      store.insert(row);
      state.demoStore = store;
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(cfg().TABLE)
        .insert([{ child_name: name, parent_phone: phone, check_in: new Date().toISOString() }])
        .select()
        .single();
      if (error) throw new Error("Could not check in: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showPass(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Check in";
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

/* ---------- entry pass view ---------- */
function showPass(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-pass").hidden = false;
  renderPass(row);
  window.scrollTo({ top: 0 });

  clearInterval(state.ticker);
  state.ticker = setInterval(() => renderPass(state.row), 30000);

  if (isDemo()) {
    // Follow this entry live via the shared demo store — the dashboard
    // (even in another tab) drives check-out, like the real backend.
    const store = state.demoStore || demoStore(cfg().TABLE || "play_entries", demoEntries);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.row.id);
      if (r && r.check_out !== state.row.check_out) {
        state.row = r;
        renderPass(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = api.onRow(sb, row.id, (r) => { state.row = r; renderPass(r); });
  });
}

function prettyTime(iso) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function elapsedStr(fromISO, toISO) {
  const ms = Math.max(0, new Date(toISO || Date.now()) - new Date(fromISO));
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
}

function renderPass(row) {
  const inside = !row.check_out;
  $("#passName").textContent = row.child_name;
  $("#passStatus").innerHTML = inside
    ? `<span class="st inside">Inside</span><div style="margin-top:8px"><strong>Having fun.</strong> Show this pass at the gate for pickup.</div>`
    : `<span class="st checked_out">Checked out</span><div style="margin-top:8px"><strong>Checked out.</strong> See you next time.</div>`;
  $("#dPhone").textContent = row.parent_phone || "—";
  $("#dCheckin").textContent = prettyTime(row.check_in);
  $("#dElapsed").textContent = inside
    ? elapsedStr(row.check_in)
    : elapsedStr(row.check_in, row.check_out) + " (total)";
  if (!inside) clearInterval(state.ticker);
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  clearInterval(state.ticker);
  state.row = null;
  $("#entryForm").reset();
  $("#view-pass").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
