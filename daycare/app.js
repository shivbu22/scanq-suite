/* DaycareQ — customer check-in page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoCheckins } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const CHK_KEY = "scanq-daycare-checkin"; // this device's check-in id

const state = { rec: null, sb: null, store: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Little Stars Daycare"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
$("#inChild").addEventListener("input", () => setInvalid("child", false));
$("#inParent").addEventListener("input", () => setInvalid("parent", false));

/* ---------- check in ---------- */
$("#checkinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const child = $("#inChild").value.trim();
  const parent = $("#inParent").value.trim();
  let ok = setInvalid("child", !child);
  ok = setInvalid("parent", !parent) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Checking in…";
  prog.classList.add("show"); bar.style.width = "40%";

  try {
    let rec;
    const payload = {
      child_name: child,
      parent_name: parent,
      phone: $("#inPhone").value.trim() || null,
      note: $("#inNote").value.trim() || null,
      check_in: new Date().toISOString(),
      check_out: null,
    };
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: shared demo store so the dashboard sees it.
      const store = demoStore(cfg().TABLE || "daycare_checkins", demoCheckins);
      const newId = "demo-" + Date.now();
      store.insert({ id: newId, ...payload });
      rec = store.read().find((x) => x.id === newId) || null;
      state.store = store;
    } else {
      const sb = await getClient();
      const { data, error } = await sb.from(cfg().TABLE)
        .insert([payload])
        .select().single();
      if (error) throw new Error("Could not check in: " + error.message);
      rec = data;
      bar.style.width = "100%";
      state.sb = sb;
    }
    try { localStorage.setItem(CHK_KEY, rec.id); } catch (_) { /* ignore */ }
    showPass(rec);
    toast("Checked in! Have a great day.");
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Check in now";
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

/* ---------- check-in pass ---------- */
function showPass(rec) {
  state.rec = rec;
  $("#view-form").hidden = true;
  $("#view-pass").hidden = false;
  window.scrollTo({ top: 0 });
  renderPass();

  if (isDemo()) {
    const store = state.store || demoStore(cfg().TABLE || "daycare_checkins", demoCheckins);
    state.store = store;
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.rec.id);
      if (r) { state.rec = r; renderPass(); }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.sb = sb;
    state.channel?.unsubscribe?.();
    state.channel = sb.channel("daycare-checkin-" + rec.id)
      .on("postgres_changes", { event: "*", schema: "public", table: cfg().TABLE, filter: "id=eq." + rec.id },
        (p) => { state.rec = p.new; renderPass(); })
      .subscribe();
  });
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function renderPass() {
  const r = state.rec;
  if (!r) return;
  $("#pChild").textContent = r.child_name;
  const inside = !r.check_out;
  $("#pStatus").innerHTML = inside
    ? "<strong>Inside now.</strong> Safe and sound with us."
    : `<strong>Checked out.</strong> Picked up at ${fmtTime(r.check_out)}.`;
  $("#pParent").textContent = r.parent_name || "—";
  $("#pIn").textContent = fmtTime(r.check_in);
  $("#pOut").textContent = r.check_out ? fmtTime(r.check_out) : "—";
  $("#pNote").textContent = r.note || "—";
}

$("#btnNew").onclick = () => {
  state.channel?.unsubscribe?.();
  state.rec = null; state.sb = null; state.store = null;
  try { localStorage.removeItem(CHK_KEY); } catch (_) { /* ignore */ }
  $("#checkinForm").reset();
  $("#view-pass").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

/* ---------- boot: resume existing check-in ---------- */
(async () => {
  let id = null;
  try { id = localStorage.getItem(CHK_KEY); } catch (_) { /* ignore */ }
  if (!id) { window.__sqBoot = true; return; }
  try {
    let rec = null;
    if (isDemo() || !isConfigured()) {
      rec = demoStore(cfg().TABLE || "daycare_checkins", demoCheckins).read().find((x) => x.id === id) || null;
    } else {
      const sb = await getClient();
      const { data } = await sb.from(cfg().TABLE).select("*").eq("id", id).maybeSingle();
      rec = data;
      state.sb = sb;
    }
    if (rec) showPass(rec);
  } catch (_) { /* stay on the form */ }
  window.__sqBoot = true;
})();
