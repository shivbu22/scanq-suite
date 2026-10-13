/* WaterQ — customer subscription page logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, demoStore,
} from "../shared/sq.js";
import { demoSubs, demoLogs } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const LOGS = "water_logs";
const SUB_KEY = "scanq-water-sub"; // this device's subscription id

const state = { sub: null, sb: null, subsStore: null, logsStore: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "AquaFresh"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

wireStepper("#qtyMinus", "#qtyPlus", "#inQty");

function wireStepper(minusSel, plusSel, inputSel) {
  const input = $(inputSel);
  const step = (d) => {
    let v = (parseInt(input.value, 10) || 1) + d;
    v = Math.min(20, Math.max(1, v));
    input.value = v;
  };
  $(minusSel).onclick = () => step(-1);
  $(plusSel).onclick = () => step(1);
}

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
$("#inName").addEventListener("input", () => setInvalid("name", false));
$("#inAddress").addEventListener("input", () => setInvalid("address", false));

/* ---------- subscribe ---------- */
$("#subForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const address = $("#inAddress").value.trim();
  let cans = parseInt($("#inQty").value, 10) || 0;
  cans = Math.min(20, Math.max(1, cans));
  let ok = setInvalid("name", !name);
  ok = setInvalid("address", !address) && ok;
  if (!ok || cans <= 0) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Subscribing…";
  prog.classList.add("show"); bar.style.width = "40%";

  try {
    let sub;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: shared demo stores so the dashboard sees it.
      const subsStore = demoStore(cfg().TABLE || "water_subs", demoSubs);
      const newId = "demo-" + Date.now();
      subsStore.insert({
        id: newId, customer_name: name,
        phone: $("#inPhone").value.trim() || null,
        address, cans_per_day: cans, active: true,
        created_at: new Date().toISOString(),
      });
      sub = subsStore.read().find((x) => x.id === newId) || null;
      state.subsStore = subsStore;
      state.logsStore = demoStore(LOGS, demoLogs);
    } else {
      const sb = await getClient();
      const { data, error } = await sb.from(cfg().TABLE)
        .insert([{
          customer_name: name,
          phone: $("#inPhone").value.trim() || null,
          address, cans_per_day: cans,
        }])
        .select().single();
      if (error) throw new Error("Could not subscribe: " + error.message);
      sub = data;
      bar.style.width = "100%";
      state.sb = sb;
    }
    try { localStorage.setItem(SUB_KEY, sub.id); } catch (_) { /* ignore */ }
    showSub(sub);
    toast("Subscribed! Water cans every day.");
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Start my subscription";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

function fakeProgress(bar) {
  return new Promise((res) => {
    let w = 40;
    const h = setInterval(() => {
      w = Math.min(96, w + 16);
      bar.style.width = w + "%";
      if (w >= 96) { clearInterval(h); res(); }
    }, 150);
  });
}

/* ---------- subscription view ---------- */
async function showSub(sub) {
  state.sub = sub;
  $("#view-form").hidden = true;
  $("#view-sub").hidden = false;
  window.scrollTo({ top: 0 });
  await renderSub();

  if (isDemo()) {
    const subsStore = state.subsStore || demoStore(cfg().TABLE || "water_subs", demoSubs);
    const logsStore = state.logsStore || demoStore(LOGS, demoLogs);
    state.subsStore = subsStore; state.logsStore = logsStore;
    subsStore.onChange((rows) => {
      const r = rows.find((x) => x.id === state.sub.id);
      if (r) { state.sub = r; renderSub(); }
    });
    logsStore.onChange(() => renderSub());
    return;
  }
  if (!isConfigured()) return;
  const sb = state.sb || await getClient();
  state.sb = sb;
  state.channel?.unsubscribe?.();
  state.channel = sb.channel("water-sub-" + sub.id)
    .on("postgres_changes", { event: "*", schema: "public", table: cfg().TABLE, filter: "id=eq." + sub.id },
      (p) => { state.sub = p.new; renderSub(); })
    .on("postgres_changes", { event: "*", schema: "public", table: LOGS }, () => renderSub())
    .subscribe();
}

async function todayDelivered() {
  const today = todayISO();
  if (isDemo() || !isConfigured()) {
    const logsStore = state.logsStore || demoStore(LOGS, demoLogs);
    return logsStore.read()
      .filter((l) => l.sub_id === state.sub.id && l.log_date === today)
      .reduce((s, l) => s + (parseInt(l.cans, 10) || 0), 0);
  }
  const sb = state.sb || await getClient();
  const { data } = await sb.from(LOGS).select("cans").eq("sub_id", state.sub.id).eq("log_date", today);
  return (data || []).reduce((s, l) => s + (parseInt(l.cans, 10) || 0), 0);
}

async function monthTotal() {
  const month = todayISO().slice(0, 7);
  if (isDemo() || !isConfigured()) {
    const logsStore = state.logsStore || demoStore(LOGS, demoLogs);
    return logsStore.read()
      .filter((l) => l.sub_id === state.sub.id && (l.log_date || "").startsWith(month))
      .reduce((s, l) => s + (parseInt(l.cans, 10) || 0), 0);
  }
  const sb = state.sb || await getClient();
  const { data } = await sb.from(LOGS).select("cans").eq("sub_id", state.sub.id).gte("log_date", month + "-01");
  return (data || []).reduce((s, l) => s + (parseInt(l.cans, 10) || 0), 0);
}

const fmtCans = (n) => `${n} can${n === 1 ? "" : "s"}`;

async function renderSub() {
  const sub = state.sub;
  if (!sub) return;
  $("#sName").textContent = sub.customer_name;
  const chip = $("#sStatus");
  chip.textContent = sub.active ? "Active" : "Paused";
  chip.className = "st " + (sub.active ? "active" : "inactive");
  $("#sId").textContent = String(sub.id).slice(0, 8).toUpperCase();
  $("#sDaily").textContent = fmtCans(sub.cans_per_day) + " / day";
  try {
    $("#sToday").textContent = fmtCans(await todayDelivered());
    $("#sMonth").textContent = fmtCans(await monthTotal());
  } catch (_) { /* keep previous values */ }
}

$("#btnSwitch").onclick = () => {
  state.channel?.unsubscribe?.();
  state.sub = null; state.sb = null; state.subsStore = null; state.logsStore = null;
  try { localStorage.removeItem(SUB_KEY); } catch (_) { /* ignore */ }
  $("#subForm").reset(); $("#inQty").value = "1";
  $("#view-sub").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

/* ---------- boot: resume existing subscription ---------- */
(async () => {
  let id = null;
  try { id = localStorage.getItem(SUB_KEY); } catch (_) { /* ignore */ }
  if (!id) { window.__sqBoot = true; return; }
  try {
    let sub = null;
    if (isDemo() || !isConfigured()) {
      sub = demoStore(cfg().TABLE || "water_subs", demoSubs).read().find((x) => x.id === id) || null;
    } else {
      const sb = await getClient();
      const { data } = await sb.from(cfg().TABLE).select("*").eq("id", id).maybeSingle();
      sub = data;
      state.sb = sb;
    }
    if (sub) showSub(sub);
  } catch (_) { /* stay on the form */ }
  window.__sqBoot = true;
})();
