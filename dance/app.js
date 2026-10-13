/* DanceQ — customer enrollment page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoStudents } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const STU_KEY = "scanq-dance-student"; // this device's enrollment id

const state = { student: null, sb: null, store: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Rhythm Dance Academy"));
$("#inStyle").innerHTML = (cfg().STYLES || []).map((s) => `<option>${esc(s)}</option>`).join("");
$("#inBatch").innerHTML = (cfg().BATCHES || []).map((b) => `<option>${esc(b)}</option>`).join("");
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
$("#inName").addEventListener("input", () => setInvalid("name", false));
$("#inStyle").addEventListener("change", () => setInvalid("style", false));
$("#inBatch").addEventListener("change", () => setInvalid("batch", false));

/* ---------- enroll ---------- */
$("#enrollForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const style = $("#inStyle").value;
  const batch = $("#inBatch").value;
  let ok = setInvalid("name", !name);
  ok = setInvalid("style", !style) && ok;
  ok = setInvalid("batch", !batch) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Enrolling…";
  prog.classList.add("show"); bar.style.width = "40%";

  try {
    let student;
    const fee = cfg().MONTHLY_FEE || 1500;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: shared demo store so the dashboard sees it.
      const store = demoStore(cfg().TABLE || "dance_students", demoStudents);
      const newId = "demo-" + Date.now();
      store.insert({
        id: newId, student_name: name,
        phone: $("#inPhone").value.trim() || null,
        style, batch, fee_due: fee,
        created_at: new Date().toISOString(),
      });
      student = store.read().find((x) => x.id === newId) || null;
      state.store = store;
    } else {
      const sb = await getClient();
      const { data, error } = await sb.from(cfg().TABLE)
        .insert([{
          student_name: name,
          phone: $("#inPhone").value.trim() || null,
          style, batch, fee_due: fee,
        }])
        .select().single();
      if (error) throw new Error("Could not enroll: " + error.message);
      student = data;
      bar.style.width = "100%";
      state.sb = sb;
    }
    try { localStorage.setItem(STU_KEY, student.id); } catch (_) { /* ignore */ }
    showStudent(student);
    toast("Enrolled! Welcome aboard.");
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Enroll now";
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

/* ---------- enrollment view ---------- */
function showStudent(student) {
  state.student = student;
  $("#view-form").hidden = true;
  $("#view-student").hidden = false;
  window.scrollTo({ top: 0 });
  renderStudent();

  if (isDemo()) {
    const store = state.store || demoStore(cfg().TABLE || "dance_students", demoStudents);
    state.store = store;
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.student.id);
      if (r) { state.student = r; renderStudent(); }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.sb = sb;
    state.channel?.unsubscribe?.();
    state.channel = sb.channel("dance-student-" + student.id)
      .on("postgres_changes", { event: "*", schema: "public", table: cfg().TABLE, filter: "id=eq." + student.id },
        (p) => { state.student = p.new; renderStudent(); })
      .subscribe();
  });
}

const fmtRs = (n) => "₹" + (parseFloat(n) || 0).toLocaleString("en-IN");

function renderStudent() {
  const s = state.student;
  if (!s) return;
  $("#sName").textContent = s.student_name;
  const due = parseFloat(s.fee_due) || 0;
  const chip = $("#sFeeChip");
  chip.textContent = due > 0 ? `Fee due ${fmtRs(due)}` : "Fee paid";
  chip.className = "st " + (due > 0 ? "due" : "paid");
  $("#sStyle").textContent = s.style || "—";
  $("#sBatch").textContent = (s.batch || "—") + " batch";
  $("#sFee").textContent = fmtRs(cfg().MONTHLY_FEE || 1500) + " / month";
}

$("#btnSwitch").onclick = () => {
  state.channel?.unsubscribe?.();
  state.student = null; state.sb = null; state.store = null;
  try { localStorage.removeItem(STU_KEY); } catch (_) { /* ignore */ }
  $("#enrollForm").reset();
  $("#view-student").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

/* ---------- boot: resume existing enrollment ---------- */
(async () => {
  let id = null;
  try { id = localStorage.getItem(STU_KEY); } catch (_) { /* ignore */ }
  if (!id) { window.__sqBoot = true; return; }
  try {
    let student = null;
    if (isDemo() || !isConfigured()) {
      student = demoStore(cfg().TABLE || "dance_students", demoStudents).read().find((x) => x.id === id) || null;
    } else {
      const sb = await getClient();
      const { data } = await sb.from(cfg().TABLE).select("*").eq("id", id).maybeSingle();
      student = data;
      state.sb = sb;
    }
    if (student) showStudent(student);
  } catch (_) { /* stay on the form */ }
  window.__sqBoot = true;
})();
