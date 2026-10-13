/* HajiriQ — staff check-in page logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, demoStore,
} from "../shared/sq.js";
import { demoStaff, demoAttendance } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const DEMO = isDemo() || !isConfigured();
const STAFF_TABLE = cfg().STAFF_TABLE || "hajiri_staff";
const ATT_TABLE = cfg().ATT_TABLE || "hajiri_attendance";

const state = { staff: null, att: null, staffStore: null, attStore: null, sb: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "My Shop"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

const normPhone = (p) => String(p || "").replace(/\D/g, "").replace(/^91(\d{10})$/, "$1");

/* ---------- data layer (demo store or Supabase) ---------- */
async function boot() {
  if (DEMO) {
    state.staffStore = demoStore(STAFF_TABLE, demoStaff);
    state.attStore = demoStore(ATT_TABLE, demoAttendance);
  } else {
    state.sb = await getClient();
  }
}

async function findStaff(phone) {
  const want = normPhone(phone);
  if (DEMO) {
    return state.staffStore.read().find((s) => s.active && normPhone(s.phone) === want) || null;
  }
  const { data, error } = await state.sb.from(STAFF_TABLE)
    .select("*").eq("active", true);
  if (error) throw new Error("Could not look you up: " + error.message);
  return (data || []).find((s) => normPhone(s.phone) === want) || null;
}

async function loadToday(staffId) {
  const day = todayISO();
  if (DEMO) {
    return state.attStore.read().find((a) => a.staff_id === staffId && a.work_date === day) || null;
  }
  const { data, error } = await state.sb.from(ATT_TABLE)
    .select("*").eq("staff_id", staffId).eq("work_date", day).maybeSingle();
  if (error) throw new Error("Could not load today: " + error.message);
  return data;
}

async function saveAtt(patch, insertBase) {
  if (DEMO) {
    if (state.att) {
      state.attStore.update(state.att.id, patch);
      state.att = { ...state.att, ...patch };
    } else {
      const row = { id: "att-" + Date.now(), ...insertBase, ...patch, created_at: new Date().toISOString() };
      state.attStore.insert(row);
      state.att = row;
    }
    return;
  }
  if (state.att) {
    const { error } = await state.sb.from(ATT_TABLE).update(patch).eq("id", state.att.id);
    if (error) throw error;
    state.att = { ...state.att, ...patch };
  } else {
    const { data, error } = await state.sb.from(ATT_TABLE)
      .insert([{ ...insertBase, ...patch }]).select().single();
    if (error) throw error;
    state.att = data;
  }
}

/* ---------- phone lookup ---------- */
$("#phoneForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = $("#inPhone").value.trim();
  const bad = !normPhone(phone);
  document.querySelector('[data-f="phone"]').classList.toggle("invalid", bad);
  if (bad) return;
  const btn = $("#btnFind");
  btn.disabled = true; btn.textContent = "Finding…";
  try {
    const staff = await findStaff(phone);
    if (!staff) {
      toast("No staff found with this number. Ask your owner to add you.");
      return;
    }
    state.staff = staff;
    state.att = await loadToday(staff.id);
    $("#view-lookup").hidden = true;
    $("#view-check").hidden = false;
    $("#staffName").textContent = staff.name;
    renderToday();
    window.scrollTo({ top: 0 });
  } catch (err) {
    toast(err.message || "Something went wrong.");
  } finally {
    btn.disabled = false; btn.textContent = "Find me";
  }
});
$("#inPhone").addEventListener("input", () =>
  document.querySelector('[data-f="phone"]').classList.remove("invalid"));

/* ---------- check in / out ---------- */
const fmtTime = (iso) => iso
  ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
  : "—";

function renderToday() {
  const a = state.att;
  $("#dIn").textContent = fmtTime(a?.check_in);
  $("#dOut").textContent = fmtTime(a?.check_out);
  $("#dStatus").innerHTML = a
    ? `<span class="st ${a.status}">${esc((cfg().STATUS_LABELS || {})[a.status] || a.status)}</span>`
    : `<span class="st nothing">Not marked yet</span>`;
  $("#btnIn").disabled = !!a?.check_in;
  $("#btnOut").disabled = !a?.check_in || !!a?.check_out;
}

$("#btnIn").onclick = async () => {
  const btn = $("#btnIn");
  btn.disabled = true;
  try {
    await saveAtt(
      { check_in: new Date().toISOString(), status: "present" },
      { staff_id: state.staff.id, work_date: todayISO() }
    );
    renderToday();
    toast(`Checked in at ${fmtTime(state.att.check_in)}. Have a good day!`);
  } catch (err) {
    toast("Check-in failed: " + (err.message || err));
    btn.disabled = false;
  }
};

$("#btnOut").onclick = async () => {
  const btn = $("#btnOut");
  btn.disabled = true;
  try {
    await saveAtt({ check_out: new Date().toISOString() });
    renderToday();
    toast(`Checked out at ${fmtTime(state.att.check_out)}. See you tomorrow!`);
  } catch (err) {
    toast("Check-out failed: " + (err.message || err));
    btn.disabled = false;
  }
};

$("#btnSwitch").onclick = () => {
  state.staff = null; state.att = null;
  $("#inPhone").value = "";
  $("#view-check").hidden = true;
  $("#view-lookup").hidden = false;
};

boot().catch((e) => toast("Could not start: " + (e.message || e)));
window.__sqBoot = true;
