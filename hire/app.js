/* HireQ — job application page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, queueApi, demoStore,
} from "../shared/sq.js";
import { demoRows, demoRoles } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const api = queueApi(cfg().APP || "hire", cfg().TABLE || "hire_applications");
const ROLES_KEY = "hireq_roles";

/* ---------- open roles: managed on the dashboard, stored per device ---------- */
function getRoles() {
  try {
    const raw = localStorage.getItem(ROLES_KEY);
    if (raw) {
      const r = JSON.parse(raw);
      if (Array.isArray(r)) return r;
    }
  } catch (_) { /* storage unavailable */ }
  const seed = isDemo() ? demoRoles() : (cfg().DEFAULT_ROLES || []);
  try { localStorage.setItem(ROLES_KEY, JSON.stringify(seed)); } catch (_) { /* ignore */ }
  return seed;
}

function renderRoles() {
  const roles = getRoles();
  $("#inRole").innerHTML = roles.length
    ? roles.map((r) => `<option>${esc(r)}</option>`).join("")
    : `<option value="">No open roles right now</option>`;
}
/* dashboard (another tab) may add/remove roles — refresh the select live */
window.addEventListener("storage", (e) => { if (e.key === ROLES_KEY) renderRoles(); });

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "My Shop"));
renderRoles();
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
$("#inRole").addEventListener("change", () => clearInvalid("role"));

/* 10-digit Indian mobile number (accepts an optional 91 prefix). */
function validPhone(v) {
  let d = v.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  return /^\d{10}$/.test(d) ? d : null;
}

/* ---------- submit ---------- */
$("#applyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const phone = validPhone($("#inPhone").value);
  const role = $("#inRole").value;
  const exp = (document.querySelector('input[name="exp"]:checked') || {}).value || "Fresher";
  const note = $("#inNote").value.trim() || null;

  let ok = setInvalid("name", !name);
  ok = setInvalid("phone", !phone) && ok;
  ok = setInvalid("role", !role) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Sending…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this application, like the real backend.
      const store = demoStore(cfg().TABLE || "hire_applications", demoRows);
      store.insert({
        id: "demo-" + Date.now(),
        name, phone, role, experience: exp, note,
        status: "new",
        created_at: new Date().toISOString(),
      });
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { error } = await sb.from(cfg().TABLE)
        .insert([{ name, phone, role, experience: exp, note }]);
      if (error) throw new Error("Could not send application: " + error.message);
      bar.style.width = "100%";
    }
    showDone(name, role);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Send application";
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

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

function showDone(name, role) {
  $("#view-form").hidden = true;
  $("#view-done").hidden = false;
  $("#dName").textContent = name;
  $("#dRole").textContent = role;
  window.scrollTo({ top: 0 });
}

$("#btnAgain").onclick = () => {
  $("#applyForm").reset();
  renderRoles();
  $("#view-done").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
