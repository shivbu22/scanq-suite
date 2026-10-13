/* ServiceQ — customer portal logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, fmtBytes, queueApi, uploadFile, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const SL = C.STATUS_LABELS || {};

const state = { file: null, row: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-app-name]").forEach((el) => (el.textContent = C.APP_NAME || "ServiceQ"));
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || ""));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = C.SHOP_SUB || ""));
document.querySelector("[data-max-mb]").textContent = C.MAX_FILE_MB || 20;
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- photo picking (optional, image only) ---------- */
const dz = $("#dz"), inFile = $("#inFile"), chipBox = $("#fileChip");
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

function pickFile(f) {
  if (!f) return;
  if (!ACCEPT.includes(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) {
    toast("Only JPG or PNG photos, please.");
    return;
  }
  const max = (C.MAX_FILE_MB || 20) * 1024 * 1024;
  if (f.size > max) {
    toast(`That photo is over ${C.MAX_FILE_MB || 20} MB.`);
    return;
  }
  state.file = f;
  dz.hidden = true;
  chipBox.hidden = false;
  chipBox.innerHTML =
    `<div class="filechip"><div><div class="fn">${esc(f.name)}</div>` +
    `<div class="fs">${fmtBytes(f.size)}</div></div>` +
    `<button type="button" class="rm" aria-label="Remove photo">✕</button></div>`;
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

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inDevice").addEventListener("input", () => clearInvalid("device"));
$("#inIssue").addEventListener("input", () => clearInvalid("issue"));

/* ---------- submit ---------- */
$("#jobForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const device = $("#inDevice").value.trim();
  const issue = $("#inIssue").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("device", !device) && ok;
  ok = setInvalid("issue", !issue) && ok;
  if (!ok) return;

  const details = { device, issue };
  const phone = $("#inPhone").value.trim();

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Creating job…";
  prog.classList.add("show"); bar.style.width = "12%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      // demo: no real uploads — keep everything local
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this job, like the real backend.
      const store = demoStore(C.TABLE || "service_queue", demoRows);
      const rows = store.read();
      const token = rows.reduce((m, r) => Math.max(m, r.token || 0), 0) + 1;
      row = {
        id: "demo-" + Date.now(), token, customer_name: name,
        phone: phone || null, status: "queued",
        details, note: null,
        file_url: "", file_name: state.file ? state.file.name : "",
        file_size_bytes: state.file ? state.file.size : 0,
        created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.demoStore = store;
    } else {
      const sb = await getClient();
      const api = queueApi(C.APP, C.TABLE);
      let file_url = "", file_name = "", file_size_bytes = 0;
      if (state.file) {
        file_url = await uploadFile(sb, state.file);
        file_name = state.file.name;
        file_size_bytes = state.file.size;
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
          file_name,
          file_size_bytes,
        }])
        .select()
        .single();
      if (error) throw new Error("Could not create job: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showToken(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Get my job number";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

function fakeProgress(bar) {
  return new Promise((res) => {
    let w = 12;
    const h = setInterval(() => {
      w = Math.min(96, w + 14);
      bar.style.width = w + "%";
      if (w >= 96) { clearInterval(h); res(); }
    }, 160);
  });
}

/* ---------- token view ---------- */
function showToken(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#tokenNum").textContent = row.token;
  $("#dName").textContent = row.customer_name;
  $("#dDevice").textContent = (row.details && row.details.device) || "—";
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this job live via the shared demo store — the dashboard
    // (even in another tab) drives status changes, like the real backend.
    const store = state.demoStore || demoStore(C.TABLE || "service_queue", demoRows);
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
    const api = queueApi(C.APP, C.TABLE);
    state.channel = api.onRow(sb, row.id, (nr) => { state.row = nr; renderStatus(nr); });
    refreshPosition(sb);
  });
}

async function refreshPosition(sb) {
  const row = state.row;
  if (!row || row.status !== "queued") return;
  const { count } = await sb.from(C.TABLE)
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayISO())
    .eq("status", "queued")
    .lt("token", row.token);
  const ahead = count ?? 0;
  $("#queuePos").innerHTML = ahead === 0
    ? "<strong>You are next.</strong> Keep this screen open."
    : `<strong>${ahead} ahead of you.</strong> We will call job ${row.token}.`;
}

function renderStatus(row) {
  const order = ["queued", "active", "done"];
  const idx = order.indexOf(row.status);
  $$("#timeline li").forEach((li) => {
    const s = li.dataset.s;
    const i = order.indexOf(s);
    li.classList.toggle("done", i < idx || (row.status === "done" && i <= idx));
    li.classList.toggle("now", i === idx && row.status !== "done");
    li.querySelector(".dot").textContent = (i < idx || row.status === "done") ? "✓" : (i === idx ? "●" : "");
    if (row.status === "done" && s === "done") li.classList.add("done");
  });
  if (row.status === "active") {
    $("#queuePos").innerHTML = `<strong>${SL.active || "Repairing"} now.</strong> Our technician is on it.`;
  } else if (row.status === "done") {
    $("#queuePos").innerHTML = "<strong>Ready for pickup.</strong> Show this screen at the counter.";
  } else if (isDemo() || !isConfigured()) {
    $("#queuePos").innerHTML = `<strong>2 ahead of you.</strong> We will call job ${row.token}.`;
  }
}

/* token auto-advance removed: in the linked demo the dashboard drives status */

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null; state.file = null;
  inFile.value = ""; chipBox.hidden = true; dz.hidden = false;
  $("#jobForm").reset();
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
