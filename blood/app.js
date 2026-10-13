/* BloodQ — donor registration page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const TABLE = cfg().TABLE || "blood_donors";

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "RedCross Camp"));
$("#inGroup").innerHTML = `<option value="">Select blood group…</option>` +
  (cfg().BLOOD_GROUPS || []).map((g) => `<option>${esc(g)}</option>`).join("");
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inGroup").addEventListener("change", () => clearInvalid("group"));

const donorIdOf = (row) => "BLD-" + String(row.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();

/* ---------- submit ---------- */
$("#donorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const group = $("#inGroup").value;
  let ok = setInvalid("name", !name);
  ok = setInvalid("group", !group) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Registering…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    const payload = {
      donor_name: name,
      phone: $("#inPhone").value.trim() || null,
      blood_group: group,
      last_donation: $("#inLastDonation").value || null,
    };
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this donor, like the real backend.
      const store = demoStore(TABLE, demoRows);
      row = {
        id: "demo-" + Date.now(),
        ...payload,
        created_at: new Date().toISOString(),
      };
      store.insert(row);
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(TABLE).insert([payload]).select().single();
      if (error) throw new Error("Could not register: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showCard(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Register as donor";
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

/* ---------- donor card ---------- */
function showCard(row) {
  $("#view-form").hidden = true;
  $("#view-card").hidden = false;
  $("#donorGroup").textContent = row.blood_group || "–";
  $("#donorIdLine").innerHTML = "<strong>Donor ID " + esc(donorIdOf(row)) + "</strong>";
  $("#dName").textContent = row.donor_name;
  $("#dGroup").textContent = row.blood_group;
  $("#dLast").textContent = row.last_donation
    ? new Date(row.last_donation + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "Never";
  window.scrollTo({ top: 0 });
}

$("#btnAgain").onclick = () => {
  $("#donorForm").reset();
  $("#view-card").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
