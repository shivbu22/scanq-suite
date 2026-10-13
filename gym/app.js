/* GymQ — customer check-in page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoMembers, demoCheckins } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const TABLE = () => cfg().TABLE || "gym_checkins";
const MTABLE = () => cfg().MEMBERS_TABLE || "gym_members";

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Iron Paradise Gym"));
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

/* ---------- check-in ---------- */
$("#checkinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const phone = $("#inPhone").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("phone", !phone) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Checking in…";
  prog.classList.add("show"); bar.style.width = "40%";

  try {
    let member;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: members + check-ins live in shared demo stores so
      // the dashboard (even in another tab) sees every check-in.
      const mStore = demoStore(MTABLE(), demoMembers);
      const cStore = demoStore(TABLE(), demoCheckins);
      member = mStore.read().find((m) => (m.phone || "").replace(/\D/g, "") === phone.replace(/\D/g, ""));
      if (!member) {
        member = {
          id: "demo-m-" + Date.now(), name, phone, plan: "Monthly",
          fee_due: null, created_at: new Date().toISOString(),
        };
        mStore.insert(member);
      }
      cStore.insert({
        id: "demo-c-" + Date.now(), member_id: member.id, member_name: member.name,
        created_at: new Date().toISOString(),
      });
    } else {
      const sb = await getClient();
      const digits = phone.replace(/\D/g, "");
      const { data: found } = await sb.from(MTABLE()).select("*").eq("phone", phone).limit(1);
      member = (found && found[0]) || (found || []).find((m) => (m.phone || "").replace(/\D/g, "") === digits);
      bar.style.width = "60%";
      if (!member) {
        const { data, error } = await sb.from(MTABLE())
          .insert([{ name, phone }]).select().single();
        if (error) throw new Error("Could not create member: " + error.message);
        member = data;
      }
      const { error } = await sb.from(TABLE()).insert([{
        member_id: member.id, member_name: member.name,
      }]);
      if (error) throw new Error("Could not check in: " + error.message);
      bar.style.width = "100%";
    }
    showDone(member);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Check in";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

function fakeProgress(bar) {
  return new Promise((res) => {
    let w = 40;
    const h = setInterval(() => {
      w = Math.min(96, w + 18);
      bar.style.width = w + "%";
      if (w >= 96) { clearInterval(h); res(); }
    }, 150);
  });
}

/* ---------- confirmation ---------- */
function showDone(member) {
  const now = new Date();
  $("#checkTime").textContent = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  $("#checkMsg").innerHTML = `<strong>Welcome, ${esc(member.name.split(" ")[0])}!</strong> Have a great workout.`;
  $("#dName").textContent = member.name;
  $("#dPlan").textContent = member.plan || "—";
  const fee = $("#dFee");
  if (member.fee_due) {
    const overdue = member.fee_due < new Date().toISOString().slice(0, 10);
    fee.innerHTML = overdue
      ? `<span class="fee-overdue">Overdue since ${esc(member.fee_due)} — please clear at the counter</span>`
      : esc(member.fee_due);
  } else {
    fee.textContent = "—";
  }
  $("#view-form").hidden = true;
  $("#view-done").hidden = false;
  window.scrollTo({ top: 0 });
}

$("#btnAgain").onclick = () => {
  $("#checkinForm").reset();
  $("#view-done").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
