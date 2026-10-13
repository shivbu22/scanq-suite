/* HajiriQ — owner dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoStaff, demoAttendance } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const STAFF_TABLE = cfg().STAFF_TABLE || "hajiri_staff";
const ATT_TABLE = cfg().ATT_TABLE || "hajiri_attendance";

const state = { staff: [], att: [], tab: "today", sb: null, staffStore: null, attStore: null, month: null };

const STATUS_LABEL = { ...(cfg().STATUS_LABELS || {}) };

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
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   PASSCODE GATE (same pattern as the rest of the suite)
   ================================================================ */
if (DEMO || sessionStorage.getItem("sq_admin") === "1") showDash();
else {
  $("#view-lock").hidden = false;
  $("#inPass").focus();
}
$("#btnUnlock").onclick = tryUnlock;
$("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });

async function tryUnlock() {
  const v = $("#inPass").value.trim();
  if (!v) return;
  const h = await sha256hex(v);
  const want = await effectiveHash();
  if (h === want) {
    sessionStorage.setItem("sq_admin", "1");
    showDash();
  } else {
    $("#passErr").style.display = "block";
    $("#inPass").value = "";
    $("#inPass").focus();
  }
}

async function effectiveHash() {
  if (state.passHash) return state.passHash;
  const fallback = cfg().PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, cfg().APP || "hajiri", fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
}

/* ================================================================
   DASHBOARD
   ================================================================ */
async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  await boot();
  renderAll();
}

/* ---------- data layer ---------- */
async function boot() {
  if (DEMO || !isConfigured()) {
    state.staffStore = demoStore(STAFF_TABLE, demoStaff);
    state.attStore = demoStore(ATT_TABLE, demoAttendance);
    const reload = () => { loadLocal(); renderAll(); };
    state.staffStore.onChange(reload);
    state.attStore.onChange(reload);
    loadLocal();
  } else {
    state.sb = await getClient();
    await reloadRemote();
    state.sb.channel(ATT_TABLE + "-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: ATT_TABLE }, async () => {
        await reloadRemote();
        renderAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: STAFF_TABLE }, async () => {
        await reloadRemote();
        renderAll();
      })
      .subscribe();
  }
}

function loadLocal() {
  state.staff = state.staffStore.read();
  state.att = state.attStore.read();
}

async function reloadRemote() {
  const [s, a] = await Promise.all([
    state.sb.from(STAFF_TABLE).select("*").order("name"),
    state.sb.from(ATT_TABLE).select("*").eq("work_date", todayISO()),
  ]);
  if (s.error) throw new Error("Could not load staff: " + s.error.message);
  if (a.error) throw new Error("Could not load attendance: " + a.error.message);
  state.staff = s.data || [];
  state.att = a.data || [];
}

function todayRow(staffId) {
  const day = todayISO();
  return state.att.find((a) => a.staff_id === staffId && a.work_date === day) || null;
}

async function upsertAttendance(staffId, patch) {
  const day = todayISO();
  if (DEMO || !isConfigured()) {
    const row = todayRow(staffId);
    if (row) state.attStore.update(row.id, patch);
    else state.attStore.insert({
      id: "att-" + Date.now(), staff_id: staffId, work_date: day,
      check_in: null, check_out: null, ...patch,
      created_at: new Date().toISOString(),
    });
    loadLocal();
    return;
  }
  const { error } = await state.sb.from(ATT_TABLE).upsert(
    { staff_id: staffId, work_date: day, ...patch },
    { onConflict: "staff_id,work_date" }
  );
  if (error) throw error;
  await reloadRemote();
}

async function saveStaff(row) {
  if (DEMO || !isConfigured()) {
    state.staffStore.insert({
      id: "staff-" + Date.now(), active: true,
      created_at: new Date().toISOString(), ...row,
    });
    loadLocal();
    return;
  }
  const { error } = await state.sb.from(STAFF_TABLE).insert([row]);
  if (error) throw error;
  await reloadRemote();
}

async function toggleStaffActive(staff) {
  if (DEMO || !isConfigured()) {
    state.staffStore.update(staff.id, { active: !staff.active });
    loadLocal();
    return;
  }
  const { error } = await state.sb.from(STAFF_TABLE).update({ active: !staff.active }).eq("id", staff.id);
  if (error) throw error;
  await reloadRemote();
}

/* ---------- tabs ---------- */
function bindDash() {
  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
      $("#tab-today").hidden = state.tab !== "today";
      $("#tab-staff").hidden = state.tab !== "staff";
      $("#tab-salary").hidden = state.tab !== "salary";
      if (state.tab === "salary") renderSalary();
      else renderAll();
    }));

  $("#todayList").addEventListener("click", onStatusAction);
  $("#staffList").addEventListener("click", onStaffAction);
  $("#staffForm").addEventListener("submit", onAddStaff);
  $("#inMonth").addEventListener("change", () => { state.month = $("#inMonth").value; renderSalary(); });

  const btnPass = $("#btnPasscode");
  if (DEMO || !isConfigured()) {
    btnPass.hidden = true; // nowhere to save it without the backend
  } else {
    btnPass.onclick = () => openPasscodeModal({
      app: cfg().APP || "hajiri",
      getSb: getClient,
      fallbackHash: cfg().PASSCODE_HASH || "",
      toast,
    });
  }

  // default salary month = current month
  const m = todayISO().slice(0, 7);
  state.month = m;
  $("#inMonth").value = m;
}

/* ---------- today tab ---------- */
function renderAll() {
  renderStats();
  if (state.tab === "today") renderToday();
  else if (state.tab === "staff") renderStaff();
  $("#cToday").textContent = activeStaff().length || "";
  $("#cStaff").textContent = activeStaff().length || "";
}

const activeStaff = () => state.staff.filter((s) => s.active);

function renderStats() {
  const staff = activeStaff();
  let present = 0, absent = 0, unmarked = 0;
  staff.forEach((s) => {
    const r = todayRow(s.id);
    if (!r) unmarked++;
    else if (r.status === "present" || r.status === "half") present++;
    else absent++;
  });
  $("#stPresent").textContent = present;
  $("#stAbsent").textContent = absent;
  $("#stUnmarked").textContent = unmarked;
}

const fmtTime = (iso) => iso
  ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
  : "—";

function renderToday() {
  const list = $("#todayList");
  const staff = activeStaff();
  if (!staff.length) {
    list.innerHTML = `<div class="empty"><div class="big">No staff yet</div><div>Add your team on the Staff tab to start marking attendance.</div></div>`;
    return;
  }
  list.innerHTML = staff.map((s) => {
    const r = todayRow(s.id);
    const times = r
      ? `In: ${fmtTime(r.check_in)} · Out: ${fmtTime(r.check_out)}`
      : "Not marked yet";
    const chip = r
      ? `<span class="st ${r.status}">${esc(STATUS_LABEL[r.status] || r.status)}</span>`
      : `<span class="st nothing">Not marked</span>`;
    const btns = ["present", "half", "absent", "leave"].map((st) =>
      `<button class="stbtn ${r?.status === st ? "on-" + st : ""}" data-staff="${s.id}" data-status="${st}">${esc(STATUS_LABEL[st])}</button>`
    ).join("");
    return `<div class="qcard" data-id="${s.id}">
      <div class="qcard-top">
        <div class="qmeta">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="qname">${esc(s.name)}</span>${chip}
          </div>
          <div class="qtime">${esc(s.phone || "")} · ₹${Number(s.daily_wage || 0)}/day · ${times}</div>
        </div>
      </div>
      <div class="qactions" style="display:flex;gap:8px;flex-wrap:wrap">${btns}</div>
    </div>`;
  }).join("");
}

async function onStatusAction(e) {
  const btn = e.target.closest("[data-status]");
  if (!btn) return;
  const { staff: staffId, status } = btn.dataset;
  btn.disabled = true;
  try {
    await upsertAttendance(staffId, { status });
    renderAll();
    const s = state.staff.find((x) => x.id === staffId);
    toast(`${s ? s.name : "Staff"} marked ${STATUS_LABEL[status] || status}.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* ---------- staff tab ---------- */
function renderStaff() {
  const list = $("#staffList");
  const rows = [...state.staff].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">Roster is empty</div><div>Add your first staff member above.</div></div>`;
    return;
  }
  list.innerHTML = rows.map((s) => `
    <div class="qcard" data-id="${s.id}" ${s.active ? "" : 'style="opacity:.55"'}>
      <div class="qcard-top">
        <div class="qmeta">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="qname">${esc(s.name)}</span>
            ${s.active ? "" : `<span class="st nothing">Inactive</span>`}
          </div>
          <div class="qtime">${esc(s.phone || "no phone")} · ₹${Number(s.daily_wage || 0)}/day</div>
        </div>
      </div>
      <div class="qactions">
        <button class="btn danger-text" data-toggle="${s.id}">${s.active ? "Deactivate" : "Reactivate"}</button>
      </div>
    </div>`).join("");
}

async function onStaffAction(e) {
  const btn = e.target.closest("[data-toggle]");
  if (!btn) return;
  const staff = state.staff.find((s) => s.id === btn.dataset.toggle);
  if (!staff) return;
  btn.disabled = true;
  try {
    await toggleStaffActive(staff);
    renderAll();
    toast(`${staff.name} ${staff.active ? "deactivated" : "reactivated"}.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

async function onAddStaff(e) {
  e.preventDefault();
  const name = $("#inSName").value.trim();
  const phone = $("#inSPhone").value.trim();
  const wage = parseFloat($("#inSWage").value);
  const okName = !!name;
  const okWage = Number.isFinite(wage) && wage >= 0;
  document.querySelector('[data-f="sname"]').classList.toggle("invalid", !okName);
  document.querySelector('[data-f="swage"]').classList.toggle("invalid", !okWage);
  if (!okName || !okWage) return;
  const btn = $("#btnAddStaff");
  btn.disabled = true; btn.textContent = "Adding…";
  try {
    await saveStaff({ name, phone: phone || null, daily_wage: wage });
    $("#staffForm").reset();
    renderAll();
    toast(`${name} added to the roster.`);
  } catch (err) {
    toast("Could not add staff: " + (err.message || err));
  } finally {
    btn.disabled = false; btn.textContent = "Add staff";
  }
}
$("#inSName")?.addEventListener?.("input", () => document.querySelector('[data-f="sname"]').classList.remove("invalid"));

/* ---------- salary tab ---------- */
function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const endD = new Date(y, m, 0).toISOString().slice(0, 10);
  return { start, end: endD };
}

async function monthAttendance(month) {
  const { start, end } = monthRange(month);
  if (DEMO || !isConfigured()) {
    return state.attStore.read().filter((a) => a.work_date >= start && a.work_date <= end);
  }
  const sb = state.sb || await getClient();
  const { data, error } = await sb.from(ATT_TABLE)
    .select("*").gte("work_date", start).lte("work_date", end);
  if (error) throw new Error("Could not load salary data: " + error.message);
  return data || [];
}

async function renderSalary() {
  const month = state.month || todayISO().slice(0, 7);
  const lbl = new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  $("#salaryMonthLbl").textContent = "· " + lbl;
  const table = $("#salaryTable");
  try {
    const rows = await monthAttendance(month);
    const byStaff = {};
    rows.forEach((r) => { (byStaff[r.staff_id] = byStaff[r.staff_id] || []).push(r); });

    const staff = state.staff.filter((s) => Number(s.daily_wage || 0) >= 0);
    let tP = 0, tH = 0, tA = 0, tL = 0, tPay = 0;
    const trs = staff.map((s) => {
      const rs = byStaff[s.id] || [];
      const p = rs.filter((r) => r.status === "present").length;
      const h = rs.filter((r) => r.status === "half").length;
      const a = rs.filter((r) => r.status === "absent").length;
      const l = rs.filter((r) => r.status === "leave").length;
      const pay = Math.round((p + h * 0.5) * Number(s.daily_wage || 0));
      tP += p; tH += h; tA += a; tL += l; tPay += pay;
      return `<tr>
        <td>${esc(s.name)}<br /><span style="color:var(--faint);font-size:12px">₹${Number(s.daily_wage || 0)}/day</span></td>
        <td>${p}</td><td>${h}</td><td>${a}</td><td>${l}</td>
        <td class="pay">₹${pay.toLocaleString("en-IN")}</td>
      </tr>`;
    }).join("");

    table.innerHTML = `
      <thead><tr><th>Staff</th><th>Present</th><th>Half</th><th>Absent</th><th>Leave</th><th class="pay">Payable</th></tr></thead>
      <tbody>${trs || `<tr><td colspan="6" style="text-align:center;color:var(--faint)">No attendance marked this month.</td></tr>`}</tbody>
      <tfoot><tr class="total"><td>Total</td><td>${tP}</td><td>${tH}</td><td>${tA}</td><td>${tL}</td><td class="pay">₹${tPay.toLocaleString("en-IN")}</td></tr></tfoot>`;
  } catch (err) {
    table.innerHTML = `<tbody><tr><td style="color:var(--bad)">${esc(err.message || err)}</td></tr></tbody>`;
  }
}

window.__sqBoot = true;
