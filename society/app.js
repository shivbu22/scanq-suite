/* SocietyQ — resident portal page logic (dues, complaints, gate entry). */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, timeAgo, demoStore,
} from "../shared/sq.js";
import { demoDues, demoComplaints, demoVisitors } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const T = C.TABLES || { dues: "society_dues", complaints: "society_complaints", visitors: "society_visitors" };

const state = { stores: {}, gateRow: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Greenview Society"));
$("#inCCat").innerHTML = (C.COMPLAINT_CATEGORIES || []).map((s) => `<option>${esc(s)}</option>`).join("");
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

$$("#custTabs button").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#custTabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
    ["dues", "complaint", "gate"].forEach((k) => {
      $("#sec-" + k).hidden = b.dataset.ctab !== k;
    });
  }));

function storeFor(key, seedFn) {
  if (!state.stores[key]) state.stores[key] = demoStore(T[key] || key, seedFn);
  return state.stores[key];
}

function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
["inFlat", "inCFlat", "inCName", "inCDesc", "inGName", "inGFlat"].forEach((id) =>
  $("#" + id).addEventListener("input", () => clearInvalid(id.replace(/^in/, "").toLowerCase())));
$("#inCCat").addEventListener("change", () => clearInvalid("ccat"));

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

async function withProgress(progId, btnId, busyText, fn) {
  const btn = $(btnId), prog = $(progId), bar = prog.querySelector("i");
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = busyText;
  prog.classList.add("show"); bar.style.width = "30%";
  try {
    await fn(bar);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = orig;
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
}

/* ---------- dues ---------- */
$("#duesForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const flat = $("#inFlat").value.trim();
  if (!setInvalid("flat", !flat)) return;
  withProgress("#progDues", "#btnDues", "Checking…", async (bar) => {
    let rows;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      rows = storeFor("dues", demoDues).read()
        .filter((r) => (r.flat_no || "").toLowerCase() === flat.toLowerCase())
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(T.dues).select("*")
        .eq("flat_no", flat).order("created_at", { ascending: false });
      if (error) throw new Error("Could not load dues: " + error.message);
      bar.style.width = "100%";
      rows = data || [];
    }
    renderDues(flat, rows);
  });
});

function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

function renderDues(flat, rows) {
  const box = $("#duesList");
  const unpaid = rows.filter((r) => !r.paid);
  const total = unpaid.reduce((s, r) => s + Number(r.amount || 0), 0);
  if (!rows.length) {
    box.innerHTML = `<div class="card"><div class="empty"><div class="big">No dues found</div><div>No records for flat ${esc(flat)}. Check the flat number.</div></div></div>`;
    return;
  }
  box.innerHTML = `<div class="card">
      <h2 class="sec" style="margin-top:0">Flat ${esc(flat)}</h2>
      ${unpaid.length
        ? `<div style="font-size:15px;margin-bottom:10px">Due now: <strong>${money(total)}</strong></div>`
        : `<div style="font-size:15px;margin-bottom:10px;color:var(--brand-deep)"><strong>All clear.</strong> Nothing due.</div>`}
      ${rows.map((r) => `
        <div class="kv">
          <span class="k">${esc(r.month || "")}<br /><small style="color:var(--faint)">${timeAgo(r.created_at)}</small></span>
          <span class="v" style="text-align:right">${money(r.amount)}<br />
            <span class="st ${r.paid ? "paid" : "unpaid"}" style="font-size:11.5px">${r.paid ? "Paid" : "Unpaid"}</span>
          </span>
        </div>`).join("")}
    </div>`;
}

/* ---------- complaint ---------- */
$("#complaintForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const flat = $("#inCFlat").value.trim();
  const name = $("#inCName").value.trim();
  const category = $("#inCCat").value;
  const description = $("#inCDesc").value.trim();
  let ok = setInvalid("cflat", !flat);
  ok = setInvalid("cname", !name) && ok;
  ok = setInvalid("ccat", !category) && ok;
  ok = setInvalid("cdesc", !description) && ok;
  if (!ok) return;
  withProgress("#progComplaint", "#btnComplaint", "Raising…", async (bar) => {
    const payload = {
      flat_no: flat, resident_name: name, category, description, status: "open",
    };
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      const store = storeFor("complaints", demoComplaints);
      row = { id: "demo-" + Date.now(), ...payload, created_at: new Date().toISOString() };
      store.insert(row);
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(T.complaints).insert([payload]).select().single();
      if (error) throw new Error("Could not raise complaint: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    $("#complaintWrap").hidden = true;
    $("#complaintDone").hidden = false;
    $("#compTicket").textContent = "#" + String(row.id).slice(-6).toUpperCase();
    $("#compLine").innerHTML = `<strong>${esc(category)}</strong> · Flat ${esc(flat)} — the society office has been notified.`;
    window.scrollTo({ top: 0 });
  });
});

$("#btnCompAgain").onclick = () => {
  $("#complaintForm").reset();
  $("#complaintDone").hidden = true;
  $("#complaintWrap").hidden = false;
};

/* ---------- gate entry ---------- */
$("#gateForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const visitor = $("#inGName").value.trim();
  const flat = $("#inGFlat").value.trim();
  const purpose = $("#inGPurpose").value.trim() || null;
  let ok = setInvalid("gname", !visitor);
  ok = setInvalid("gflat", !flat) && ok;
  if (!ok) return;
  withProgress("#progGate", "#btnGate", "Registering…", async (bar) => {
    const payload = {
      visitor_name: visitor, flat_no: flat, purpose,
      check_in: new Date().toISOString(), check_out: null,
    };
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      const store = storeFor("visitors", demoVisitors);
      row = { id: "demo-" + Date.now(), ...payload };
      store.insert(row);
      state.gateStore = store;
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(T.visitors).insert([payload]).select().single();
      if (error) throw new Error("Could not register entry: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showGatePass(row);
  });
});

function showGatePass(row) {
  state.gateRow = row;
  $("#gateWrap").hidden = true;
  $("#gateDone").hidden = false;
  renderGatePass(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this pass live — the gate guard's check-out updates it here.
    const store = state.gateStore || storeFor("visitors", demoVisitors);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.gateRow.id);
      if (r && r.check_out !== state.gateRow.check_out) {
        state.gateRow = r;
        renderGatePass(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    sb.channel("gate-" + row.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: T.visitors, filter: "id=eq." + row.id },
        (p) => { state.gateRow = p.new; renderGatePass(p.new); })
      .subscribe();
  });
}

function renderGatePass(row) {
  $("#gateName").textContent = row.visitor_name;
  $("#gateLine").innerHTML = `Visiting <strong>${esc(row.flat_no)}</strong>` +
    (row.purpose ? ` · ${esc(row.purpose)}` : "") +
    `<br /><small style="color:var(--faint)">Checked in ${timeAgo(row.check_in)}</small>`;
  $("#gateStatus").innerHTML = row.check_out
    ? `<span class="st left">Checked out</span>`
    : `<span class="st inside">● Inside the society</span>`;
}

$("#btnGateAgain").onclick = () => {
  state.gateRow = null;
  $("#gateForm").reset();
  $("#gateDone").hidden = true;
  $("#gateWrap").hidden = false;
};

window.__sqBoot = true;
