/* CyberQ — customer print-job page logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, fmtBytes, queueApi, uploadFile, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const api = queueApi(C.APP || "cyber", C.TABLE || "cyber_queue");

const state = { row: null, channel: null, file: null, copies: 1, color: "B&W" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || "Fast Print Cyber Cafe"));
document.querySelector("[data-max-mb]").textContent = C.MAX_FILE_MB || 20;
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- document picking (optional) ---------- */
const dz = $("#dz"), inFile = $("#inFile"), chipBox = $("#fileChip");
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

function pickFile(f) {
  if (!f) return;
  if (!ACCEPT.includes(f.type) && !/\.(png|jpe?g|webp|pdf)$/i.test(f.name)) {
    toast("Only PDF, JPG or PNG documents, please.");
    return;
  }
  const max = (C.MAX_FILE_MB || 20) * 1024 * 1024;
  if (f.size > max) {
    toast(`That file is over ${C.MAX_FILE_MB || 20} MB.`);
    return;
  }
  state.file = f;
  dz.hidden = true;
  chipBox.hidden = false;
  chipBox.innerHTML =
    `<div class="filechip"><div><div class="fn">${esc(f.name)}</div>` +
    `<div class="fs">${fmtBytes(f.size)}</div></div>` +
    `<button type="button" class="rm" aria-label="Remove document">✕</button></div>`;
  chipBox.querySelector(".rm").onclick = () => {
    state.file = null; inFile.value = "";
    chipBox.hidden = true; dz.hidden = false;
  };
}
dz.addEventListener("click", () => inFile.click());
dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") inFile.click(); });
inFile.addEventListener("change", () => pickFile(inFile.files[0]));
["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
dz.addEventListener("drop", (e) => pickFile(e.dataTransfer.files[0]));

/* ---------- copies stepper + colour toggle ---------- */
$("#cpMinus").onclick = () => { state.copies = Math.max(1, state.copies - 1); $("#cpVal").textContent = state.copies; };
$("#cpPlus").onclick = () => { state.copies = Math.min(99, state.copies + 1); $("#cpVal").textContent = state.copies; };
function setColor(c) {
  state.color = c;
  $("#segBw").setAttribute("aria-pressed", String(c === "B&W"));
  $("#segColor").setAttribute("aria-pressed", String(c === "Colour"));
}
$("#segBw").onclick = () => setColor("B&W");
$("#segColor").onclick = () => setColor("Colour");

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inPages").addEventListener("input", () => clearInvalid("pages"));

function jobSummary(d) {
  return `${d.pages || 1} page${(d.pages || 1) > 1 ? "s" : ""} × ${d.copies || 1} ${d.color || "B&W"}`;
}

/* ---------- submit ---------- */
$("#tokenForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const pages = Math.max(1, parseInt($("#inPages").value, 10) || 0);
  let ok = setInvalid("name", !name);
  ok = setInvalid("pages", pages < 1) && ok;
  if (!ok) return;

  const details = { pages, copies: state.copies, color: state.color };
  if (state.file) details.file_name = state.file.name;
  const phone = $("#inPhone").value.trim();

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Sending…";
  prog.classList.add("show"); bar.style.width = "12%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      // demo: no real uploads — keep everything local
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this job, like the real backend.
      const store = demoStore(C.TABLE || "cyber_queue", demoRows);
      const rows = store.read();
      const token = rows.reduce((m, r) => Math.max(m, r.token || 0), 0) + 1;
      row = {
        id: "demo-" + Date.now(), token, customer_name: name,
        phone: phone || null, status: "queued",
        details, file_url: "",
        created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.demoStore = store;
    } else {
      const sb = await getClient();
      let file_url = "";
      if (state.file) {
        file_url = await uploadFile(sb, state.file);
        bar.style.width = "60%";
      }
      const token = await api.nextToken(sb);
      bar.style.width = "80%";
      const { data, error } = await sb.from(C.TABLE)
        .insert([{
          token,
          customer_name: name,
          phone: phone || null,
          status: "queued",
          details,
          file_url,
        }])
        .select()
        .single();
      if (error) throw new Error("Could not create print job: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showToken(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Get my print token";
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

/* ---------- token view ---------- */
function showToken(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#tokenNum").textContent = row.token;
  $("#dName").textContent = row.customer_name;
  $("#dJob").textContent = jobSummary(row.details || {});
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this token live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.demoStore || demoStore(C.TABLE || "cyber_queue", demoRows);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.row.id);
      if (r && r.status !== state.row.status) {
        state.row = r;
        renderStatus(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = api.onRow(sb, row.id, (r) => { state.row = r; renderStatus(r); refreshPosition(sb); });
    refreshPosition(sb);
  });
}

async function refreshPosition(sb) {
  const row = state.row;
  if (!row || row.status !== "queued") return;
  try {
    const { count } = await sb.from(C.TABLE)
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayISO())
      .eq("status", "queued")
      .lt("token", row.token);
    const ahead = count ?? 0;
    $("#queuePos").innerHTML = ahead === 0
      ? "<strong>You are next.</strong> Please stay nearby."
      : `<strong>${ahead} ahead of you.</strong> We will call token ${row.token}.`;
  } catch (_) { /* position is a nicety — never break the page */ }
}

function renderStatus(row) {
  const order = ["queued", "active", "done"];
  const idx = order.indexOf(row.status);
  $$("#timeline li").forEach((li) => {
    const s = li.dataset.s;
    const i = order.indexOf(s);
    const finished = row.status === "done";
    li.classList.toggle("done", i < idx || (finished && i <= idx));
    li.classList.toggle("now", i === idx && !finished);
    li.querySelector(".dot").textContent = (i < idx || finished) ? "✓" : (i === idx ? "●" : "");
  });
  if (row.status === "active") {
    $("#queuePos").innerHTML = "<strong>Printing now.</strong> Almost there.";
  } else if (row.status === "done") {
    $("#queuePos").innerHTML = "<strong>Ready.</strong> Collect your prints at the counter.";
  } else if (isDemo() || !isConfigured()) {
    $("#queuePos").innerHTML = "<strong>2 ahead of you.</strong> We will call token " + row.token + ".";
  }
}

/* token auto-advance removed: in the linked demo the dashboard drives status */

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null; state.file = null;
  $("#tokenForm").reset();
  state.copies = 1; $("#cpVal").textContent = "1";
  setColor("B&W");
  inFile.value = ""; chipBox.hidden = true; dz.hidden = false;
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
