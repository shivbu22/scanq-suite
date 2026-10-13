/* RecordQ — clinic dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, fmtBytes, sha256hex, queueApi, demoStore,
  getPasscodeHash, openPasscodeModal, uploadFile, signedUrl,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const TABLE = C.TABLE || "clinic_records";
const DEMO = isDemo();
const api = queueApi(C.APP || "record", TABLE);

const state = { rows: [], sb: null, store: null, file: null, selected: null, passHash: null };
const dzEl = () => $("#dz"), inFileEl = () => $("#inFile"), chipBoxEl = () => $("#fileChip");

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* match on last 10 digits so "+91 98110 22334" and "9811022334" both hit */
const normPhone = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const localISO = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
};

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return {
    day: d.getDate(),
    mon: d.toLocaleDateString("en-IN", { month: "short" }),
    full: d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
  };
}

function visitHTML(v) {
  const f = fmtDate(v.visit_date || "");
  const notes = v.notes
    ? `<div class="vnotes">${esc(v.notes)}</div>`
    : `<div class="vnotes muted">No notes recorded for this visit.</div>`;
  const rx = v.prescription_url
    ? `<div style="margin-top:8px"><button class="btn ghost small" data-rx="${esc(v.id)}" style="width:auto">View prescription</button></div>`
    : "";
  return `<div class="visit">
    <div class="vdate"><div class="d">${f.day}</div><div class="m">${esc(f.mon)}</div></div>
    <div class="vbody">${notes}${rx}</div>
  </div>`;
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "City Care Clinic"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
document.querySelectorAll("[data-max-mb]").forEach((el) => (el.textContent = C.MAX_FILE_MB || 10));
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));
$("#inDate").value = localISO();

/* ================================================================
   PASSCODE GATE
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

/* The passcode hash lives in the DB (changeable from the dashboard);
   fall back to config.js when offline/demo/unconfigured. */
async function effectiveHash() {
  if (state.passHash) return state.passHash;
  const fallback = C.PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, C.APP || "record", fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
}

async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  await boot(renderDash);
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function bindDash() {
  const btnPass = $("#btnPasscode");
  if (DEMO || !isConfigured()) {
    btnPass.hidden = true; // nowhere to save it without the backend
  } else {
    btnPass.onclick = () => openPasscodeModal({
      app: C.APP || "record",
      getSb: getClient,
      fallbackHash: C.PASSCODE_HASH || "",
      toast,
    });
  }
  $("#inSearch").addEventListener("input", (e) => renderSearch(e.target.value));
  $("#visitForm").addEventListener("submit", saveVisit);
  $("#inName").addEventListener("input", () => setInvalid("name", false));
  $("#inPhone").addEventListener("input", () => setInvalid("phone", false));
  $("#searchList").addEventListener("click", onPatientPick);
  $("#btnAddVisit").onclick = () => {
    const p = currentPatient();
    if (!p) return;
    $("#inName").value = p.name;
    $("#inPhone").value = p.phone;
    $("#visitCard").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#inNotes").focus();
  };
  $("#view-dash").addEventListener("click", onRxClick);
  bindPhotoPicker();
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    // Offline preview: rows live in the shared demo store so the patient
    // page (even in another tab) sees visits added here, like the real backend.
    state.store = demoStore(TABLE, demoRows);
    state.rows = state.store.read();
    state.store.onChange((rows) => { state.rows = rows; renderDash(); });
  } else {
    state.sb = await getClient();
    try {
      const { data, error } = await state.sb.from(TABLE)
        .select("*")
        .order("visit_date", { ascending: false });
      if (error) throw error;
      state.rows = data || [];
    } catch (e) {
      toast("Could not load records: " + (e.message || e));
      return;
    }
    api.onInsert(state.sb, (row) => {
      const i = state.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) state.rows[i] = row;
      else state.rows.unshift(row);
      renderDash();
    });
  }
  after();
}

/* ---------- patients ---------- */
function patients() {
  const map = new Map();
  for (const r of state.rows) {
    const key = normPhone(r.phone);
    if (!map.has(key)) map.set(key, { key, name: r.patient_name, phone: r.phone, visits: [] });
    const p = map.get(key);
    p.visits.push(r);
    // keep the most recent name spelling
    if (String(r.visit_date) >= String(p.visits[0].visit_date)) { p.name = r.patient_name; p.phone = r.phone; }
  }
  const out = [...map.values()];
  out.forEach((p) => p.visits.sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date))));
  out.sort((a, b) => String(b.visits[0].visit_date).localeCompare(String(a.visits[0].visit_date)));
  return out;
}

function currentPatient() {
  return patients().find((p) => p.key === state.selected) || null;
}

/* ---------- rendering ---------- */
function renderDash() {
  const today = localISO();
  const month = today.slice(0, 7);
  $("#stToday").textContent = state.rows.filter((r) => r.visit_date === today).length;
  $("#stPatients").textContent = new Set(
    state.rows.filter((r) => String(r.visit_date).slice(0, 7) === month).map((r) => normPhone(r.phone))
  ).size;

  // today's visits
  const tv = state.rows
    .filter((r) => r.visit_date === today)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  $("#todayList").innerHTML = tv.length
    ? tv.map((r) => patientRowHTML(r)).join("")
    : `<div class="empty"><div class="big">No visits yet today</div><div>New visits appear here instantly.</div></div>`;

  renderSearch($("#inSearch").value);
  renderPatientPanel();
}

function patientRowHTML(r) {
  const initial = (r.patient_name || "?").trim().charAt(0).toUpperCase();
  const rx = r.prescription_url
    ? `<button class="btn ghost small" data-rx="${esc(r.id)}" style="width:auto">Rx</button>` : "";
  return `<div class="pcard" data-phone="${esc(normPhone(r.phone))}">
    <div class="pav">${esc(initial)}</div>
    <div><div class="pname">${esc(r.patient_name)}</div>
    <div class="pmeta">${esc(r.phone)}${r.notes ? " · " + esc(r.notes.slice(0, 42)) + (r.notes.length > 42 ? "…" : "") : ""}</div></div>
    <span class="pgo" style="display:flex;gap:8px;align-items:center">${rx}<span>›</span></span>
  </div>`;
}

function renderSearch(q) {
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  let list = patients();
  if (needle) {
    list = list.filter((p) =>
      p.name.toLowerCase().includes(needle) ||
      (digits && normPhone(p.phone).includes(digits)));
  }
  list = list.slice(0, 12);
  $("#searchList").innerHTML = list.length
    ? list.map((p) => {
      const initial = (p.name || "?").trim().charAt(0).toUpperCase();
      return `<div class="pcard" data-phone="${esc(p.key)}">
        <div class="pav">${esc(initial)}</div>
        <div><div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${esc(p.phone)} · ${p.visits.length} visit${p.visits.length === 1 ? "" : "s"}</div></div>
        <span class="pgo">›</span>
      </div>`;
    }).join("")
    : (needle
      ? `<div class="empty"><div class="big">No matching patients</div><div>Try a different name or number.</div></div>`
      : `<div class="empty"><div class="big">Search patients</div><div>Type a name or phone number above.</div></div>`);
}

function renderPatientPanel() {
  const p = currentPatient();
  $("#patientPanel").hidden = !p;
  if (!p) return;
  $("#ppName").textContent = p.name;
  $("#ppPhone").textContent = p.phone + ` · ${p.visits.length} visit${p.visits.length === 1 ? "" : "s"}`;
  $("#ppAvatar").textContent = (p.name || "?").trim().charAt(0).toUpperCase();
  $("#ppTimeline").innerHTML = p.visits.map(visitHTML).join("");
}

function onPatientPick(e) {
  const card = e.target.closest("[data-phone]");
  if (!card || e.target.closest("[data-rx]")) return;
  state.selected = card.dataset.phone;
  renderPatientPanel();
  $("#patientPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- prescription viewing ---------- */
async function onRxClick(e) {
  const btn = e.target.closest("[data-rx]");
  if (!btn) return;
  e.stopPropagation();
  const row = state.rows.find((r) => String(r.id) === btn.dataset.rx);
  if (!row || !row.prescription_url) return;
  btn.disabled = true;
  try {
    if (row.prescription_url.startsWith("data:")) {
      window.open(row.prescription_url, "_blank", "noopener");
    } else {
      if (DEMO || !isConfigured()) { toast("Demo preview — no photo to open."); return; }
      const url = await signedUrl(state.sb, row.prescription_url, 3600);
      window.open(url, "_blank", "noopener");
    }
  } catch (err) {
    toast("Could not open prescription: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

/* ---------- photo picker (ServiceQ pattern) ---------- */
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

function bindPhotoPicker() {
  const d = dzEl(), f = inFileEl();
  d.addEventListener("click", () => f.click());
  d.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") f.click(); });
  f.addEventListener("change", () => pickFile(f.files[0]));
  ["dragover", "dragenter"].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.remove("over"); }));
  d.addEventListener("drop", (e) => pickFile(e.dataTransfer.files[0]));
}

function pickFile(file) {
  if (!file) return;
  if (!ACCEPT.includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    toast("Only JPG or PNG photos, please.");
    return;
  }
  const max = (C.MAX_FILE_MB || 10) * 1024 * 1024;
  if (file.size > max) {
    toast(`That photo is over ${C.MAX_FILE_MB || 10} MB.`);
    return;
  }
  state.file = file;
  dzEl().hidden = true;
  const box = chipBoxEl();
  box.hidden = false;
  box.innerHTML =
    `<div class="filechip"><div><div class="fn">${esc(file.name)}</div>` +
    `<div class="fs">${fmtBytes(file.size)}</div></div>` +
    `<button type="button" class="rm" aria-label="Remove photo">✕</button></div>`;
  box.querySelector(".rm").onclick = () => {
    state.file = null; inFileEl().value = "";
    box.hidden = true; dzEl().hidden = false;
  };
}

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

/* ---------- new visit ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}

async function saveVisit(e) {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const phoneRaw = $("#inPhone").value.trim();
  const phone = normPhone(phoneRaw);
  const visit_date = $("#inDate").value || localISO();
  const notes = $("#inNotes").value.trim() || null;
  let ok = setInvalid("name", !name);
  ok = setInvalid("phone", phone.length !== 10) && ok;
  if (!ok) return;

  const btn = $("#btnSave"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Saving…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let prescription_url = null;
    if (state.file) {
      if (DEMO || !isConfigured()) {
        prescription_url = await readAsDataURL(state.file); // demo: keep local
      } else {
        bar.style.width = "55%";
        prescription_url = await uploadFile(state.sb, state.file); // real: documents bucket
      }
    }
    bar.style.width = "75%";

    const row = {
      id: DEMO || !isConfigured() ? "demo-r" + Date.now() : undefined,
      patient_name: name,
      phone: phoneRaw,
      visit_date,
      notes,
      prescription_url,
      created_at: new Date().toISOString(),
    };
    if (row.id === undefined) delete row.id;

    if (DEMO || !isConfigured()) {
      state.store.insert(row);
      state.rows = state.store.read();
    } else {
      const { data, error } = await state.sb.from(TABLE).insert([{
        patient_name: name, phone: phoneRaw, visit_date, notes, prescription_url,
      }]).select().single();
      if (error) throw new Error("Could not save visit: " + error.message);
      state.rows.unshift(data);
    }
    bar.style.width = "100%";
    state.selected = phone;
    resetForm();
    renderDash();
    toast(`Visit saved for ${name}.`);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Save visit";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
}

function resetForm() {
  $("#inName").value = ""; $("#inPhone").value = "";
  $("#inDate").value = localISO(); $("#inNotes").value = "";
  state.file = null; inFileEl().value = "";
  chipBoxEl().hidden = true; dzEl().hidden = false;
}

window.__sqBoot = true;
