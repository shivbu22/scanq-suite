/* HostelQ — resident portal logic (dues lookup + complaints). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoDues, demoComplaints } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const DEMO = isDemo();
const DUES = C.DUES_TABLE || "hostel_dues";
const COMPLAINTS = C.COMPLAINTS_TABLE || "hostel_complaints";

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Sunrise PG"));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = C.SHOP_SUB || "PG & hostel portal"));
$("#inCCat").innerHTML = (C.COMPLAINT_CATEGORIES || []).map((s) => `<option>${esc(s)}</option>`).join("");
if (DEMO) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !DEMO) $("[data-cfg-warn]").hidden = false;

/* ---------- tabs ---------- */
$$(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    $("#view-dues").hidden = b.dataset.tab !== "dues";
    $("#view-complaint").hidden = b.dataset.tab !== "complaint";
    window.scrollTo({ top: 0 });
  }));

/* ---------- validation ---------- */
function setInvalid(scope, key, bad) {
  document.querySelector(`#${scope} [data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
$("#inRoom").addEventListener("input", () => setInvalid("view-dues", "room", false));
[["inCRoom", "room"], ["inCName", "name"], ["inCDesc", "desc"]].forEach(([id, key]) =>
  $("#" + id).addEventListener("input", () => setInvalid("view-complaint", key, false)));
$("#inCCat").addEventListener("change", () => setInvalid("view-complaint", "category", false));

/* ---------- demo stores ---------- */
let duesStore = null, complaintStore = null;
function stores() {
  if (DEMO || !isConfigured()) {
    duesStore = duesStore || demoStore(DUES, demoDues);
    complaintStore = complaintStore || demoStore(COMPLAINTS, demoComplaints);
  }
  return { duesStore, complaintStore };
}

/* ---------- dues lookup ---------- */
$("#duesForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const room = $("#inRoom").value.trim();
  if (!setInvalid("view-dues", "room", !room)) return;

  const btn = $("#btnDues");
  btn.disabled = true; btn.textContent = "Checking…";
  try {
    let rows;
    if (DEMO || !isConfigured()) {
      const { duesStore: s } = stores();
      rows = s.read().filter((r) => r.room_no.toLowerCase() === room.toLowerCase());
    } else {
      const sb = await getClient();
      const { data, error } = await sb.from(DUES).select("*")
        .ilike("room_no", room).order("month", { ascending: false });
      if (error) throw new Error("Could not load dues: " + error.message);
      rows = data || [];
    }
    renderDues(room, rows);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Check my dues";
  }
});

function renderDues(room, rows) {
  const box = $("#duesResult");
  if (!rows.length) {
    box.innerHTML = `<div class="empty"><div class="big">No dues found</div><div>No records for room ${esc(room)}.</div></div>`;
    return;
  }
  const due = rows.filter((r) => !r.paid).reduce((m, r) => m + Number(r.amount || 0), 0);
  box.innerHTML = `
    <div class="card stack" style="gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Room ${esc(room)}</strong> <span style="color:var(--muted)">· ${esc(rows[0].resident_name || "")}</span></div>
        <span class="st ${due > 0 ? "unpaid" : "paid"}">${due > 0 ? "₹" + due.toLocaleString("en-IN") + " due" : "All clear"}</span>
      </div>
      ${rows.map((r) => `
        <div class="kv">
          <span class="k">${esc(r.month || "—")}</span>
          <span class="v">₹${Number(r.amount || 0).toLocaleString("en-IN")}
            <span class="st ${r.paid ? "paid" : "unpaid"}" style="margin-left:8px">${r.paid ? "Paid" : "Unpaid"}</span>
          </span>
        </div>`).join("")}
      ${due > 0 ? `<div style="font-size:13.5px;color:var(--muted)">Please pay at the warden's office. Dues update here once marked paid.</div>` : ""}
    </div>`;
  box.scrollIntoView({ block: "nearest" });
}

/* ---------- complaint submit ---------- */
$("#complaintForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const room = $("#inCRoom").value.trim();
  const name = $("#inCName").value.trim();
  const cat = $("#inCCat").value;
  const desc = $("#inCDesc").value.trim();
  let ok = setInvalid("view-complaint", "room", !room);
  ok = setInvalid("view-complaint", "name", !name) && ok;
  ok = setInvalid("view-complaint", "category", !cat) && ok;
  ok = setInvalid("view-complaint", "desc", !desc) && ok;
  if (!ok) return;

  const btn = $("#btnComplaint"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Raising…";
  prog.classList.add("show"); bar.style.width = "40%";

  try {
    let row;
    const payload = { room_no: room, resident_name: name, category: cat, description: desc, status: "open" };
    if (DEMO || !isConfigured()) {
      await new Promise((res) => setTimeout(res, 600));
      const { complaintStore: s } = stores();
      row = { id: "demo-" + Date.now(), ...payload, created_at: new Date().toISOString() };
      s.insert(row);
      bar.style.width = "100%";
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(COMPLAINTS).insert([payload]).select().single();
      if (error) throw new Error("Could not raise complaint: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    $("#complaintResult").innerHTML = `
      <div class="card">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <strong>Complaint raised</strong>
          <span class="st open">Open</span>
        </div>
        <div class="kv"><span class="k">Room</span><span class="v">${esc(room)}</span></div>
        <div class="kv"><span class="k">Category</span><span class="v">${esc(cat)}</span></div>
        <div style="font-size:13.5px;color:var(--muted)">The warden has been notified. We will update the status here as it gets fixed.</div>
      </div>`;
    $("#complaintForm").reset();
    $("#complaintResult").scrollIntoView({ block: "nearest" });
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Raise complaint";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

window.__sqBoot = true;
