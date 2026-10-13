/* DairyQ — customer subscription page logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, demoStore,
} from "../shared/sq.js";
import { demoSubs, demoLogs } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const LOGS = "dairy_logs";
const SUB_KEY = "scanq-dairy-sub"; // this device's subscription id

const state = { sub: null, sb: null, subsStore: null, logsStore: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Gokul Dairy"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

wireStepper("#qtyMinus", "#qtyPlus", "#inQty");
wireStepper("#tMinus", "#tPlus", "#inTodayQty");

function wireStepper(minusSel, plusSel, inputSel) {
  const input = $(inputSel);
  const step = (d) => {
    let v = (parseFloat(input.value) || 1) + d;
    v = Math.min(10, Math.max(0.5, Math.round(v * 2) / 2));
    input.value = v;
  };
  $(minusSel).onclick = () => step(-0.5);
  $(plusSel).onclick = () => step(0.5);
}

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
$("#inName").addEventListener("input", () => setInvalid("name", false));

/* ---------- subscribe ---------- */
$("#subForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const qty = parseFloat($("#inQty").value) || 0;
  if (!setInvalid("name", !name) || qty <= 0) { toast("Enter a valid daily quantity."); return; }

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Subscribing…";
  prog.classList.add("show"); bar.style.width = "40%";

  try {
    let sub;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: shared demo stores so the dashboard sees it.
      const subsStore = demoStore(cfg().TABLE || "dairy_subs", demoSubs);
      const logsStore = demoStore(LOGS, demoLogs);
      sub = {
        id: "demo-" + Date.now(), customer_name: name,
        phone: $("#inPhone").value.trim() || null,
        daily_qty: qty, paused: false,
        created_at: new Date().toISOString(),
      };
      subsStore.insert(sub);
      logsStore.insert({
        id: "demo-l" + Date.now(), sub_id: sub.id,
        log_date: todayISO(), qty,
        created_at: new Date().toISOString(),
      });
      state.subsStore = subsStore; state.logsStore = logsStore;
    } else {
      const sb = await getClient();
      const { data, error } = await sb.from(cfg().TABLE)
        .insert([{ customer_name: name, phone: $("#inPhone").value.trim() || null, daily_qty: qty }])
        .select().single();
      if (error) throw new Error("Could not subscribe: " + error.message);
      sub = data;
      bar.style.width = "70%";
      const { error: logErr } = await sb.from(LOGS)
        .insert([{ sub_id: sub.id, log_date: todayISO(), qty }]);
      if (logErr) throw new Error("Could not set today's quantity: " + logErr.message);
      bar.style.width = "100%";
      state.sb = sb;
    }
    try { localStorage.setItem(SUB_KEY, sub.id); } catch (_) { /* ignore */ }
    showSub(sub);
    toast("Subscribed! Fresh milk every day.");
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
    const subsStore = state.subsStore || demoStore(cfg().TABLE || "dairy_subs", demoSubs);
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
  state.channel = sb.channel("dairy-sub-" + sub.id)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: cfg().TABLE, filter: "id=eq." + sub.id },
      (p) => { state.sub = p.new; renderSub(); })
    .on("postgres_changes", { event: "*", schema: "public", table: LOGS }, () => renderSub())
    .subscribe();
}

async function todayLog() {
  const today = todayISO();
  if (isDemo() || !isConfigured()) {
    const logsStore = state.logsStore || demoStore(LOGS, demoLogs);
    let log = logsStore.read().find((l) => l.sub_id === state.sub.id && l.log_date === today);
    if (!log) {
      log = { id: "demo-l" + Date.now(), sub_id: state.sub.id, log_date: today, qty: state.sub.daily_qty, created_at: new Date().toISOString() };
      logsStore.insert(log);
    }
    return log;
  }
  const sb = state.sb || await getClient();
  const { data } = await sb.from(LOGS).select("*").eq("sub_id", state.sub.id).eq("log_date", today).maybeSingle();
  if (data) return data;
  const { data: created, error } = await sb.from(LOGS)
    .insert([{ sub_id: state.sub.id, log_date: today, qty: state.sub.daily_qty }]).select().single();
  if (error) throw error;
  return created;
}

async function monthTotal() {
  const month = todayISO().slice(0, 7);
  if (isDemo() || !isConfigured()) {
    const logsStore = state.logsStore || demoStore(LOGS, demoLogs);
    return logsStore.read()
      .filter((l) => l.sub_id === state.sub.id && (l.log_date || "").startsWith(month))
      .reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
  }
  const sb = state.sb || await getClient();
  const { data } = await sb.from(LOGS).select("qty").eq("sub_id", state.sub.id).gte("log_date", month + "-01");
  return (data || []).reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
}

const fmtL = (n) => `${parseFloat(n) % 1 === 0 ? parseInt(n, 10) : parseFloat(n)} L`;

async function renderSub() {
  const sub = state.sub;
  if (!sub) return;
  $("#sName").textContent = sub.customer_name;
  const chip = $("#sStatus");
  chip.textContent = sub.paused ? "Paused" : "Active";
  chip.className = "st " + (sub.paused ? "paused" : "active");
  $("#sDaily").textContent = fmtL(sub.daily_qty) + " / day";
  try {
    const log = await todayLog();
    $("#sToday").textContent = fmtL(log.qty);
    $("#inTodayQty").value = log.qty;
    $("#sMonth").textContent = fmtL(await monthTotal());
  } catch (_) { /* keep previous values */ }
  $("#btnPause").textContent = sub.paused ? "Resume delivery" : "Pause delivery";
}

/* ---------- today's quantity ---------- */
$("#btnToday").onclick = async () => {
  const qty = parseFloat($("#inTodayQty").value) || 0;
  if (qty <= 0) { toast("Enter a valid quantity."); return; }
  try {
    if (isDemo() || !isConfigured()) {
      const logsStore = state.logsStore || demoStore(LOGS, demoLogs);
      const today = todayISO();
      const rows = logsStore.read();
      const existing = rows.find((l) => l.sub_id === state.sub.id && l.log_date === today);
      if (existing) logsStore.update(existing.id, { qty });
      else logsStore.insert({ id: "demo-l" + Date.now(), sub_id: state.sub.id, log_date: today, qty, created_at: new Date().toISOString() });
    } else {
      const sb = state.sb || await getClient();
      const { error } = await sb.from(LOGS)
        .upsert({ sub_id: state.sub.id, log_date: todayISO(), qty }, { onConflict: "sub_id,log_date" });
      if (error) throw error;
    }
    toast("Today's quantity updated.");
    renderSub();
  } catch (err) {
    toast(err.message || "Could not update.");
  }
};

/* ---------- pause / resume ---------- */
$("#btnPause").onclick = async () => {
  const next = !state.sub.paused;
  try {
    if (isDemo() || !isConfigured()) {
      const subsStore = state.subsStore || demoStore(cfg().TABLE || "dairy_subs", demoSubs);
      subsStore.update(state.sub.id, { paused: next });
      state.sub = { ...state.sub, paused: next };
    } else {
      const sb = state.sb || await getClient();
      const { error } = await sb.from(cfg().TABLE).update({ paused: next }).eq("id", state.sub.id);
      if (error) throw error;
      state.sub = { ...state.sub, paused: next };
    }
    renderSub();
    toast(next ? "Delivery paused." : "Delivery resumed.");
  } catch (err) {
    toast(err.message || "Could not update.");
  }
};

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
      sub = demoStore(cfg().TABLE || "dairy_subs", demoSubs).read().find((x) => x.id === id) || null;
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
