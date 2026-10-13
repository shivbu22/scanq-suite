/* TailorTrack — customer portal logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, queueApi,
} from "../shared/sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const C = cfg();
const SL = C.STATUS_LABELS || {};

const state = { row: null, channel: null, demoNext: 7 };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-app-name]").forEach((el) => (el.textContent = C.APP_NAME || "TailorTrack"));
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = C.SHOP_NAME || ""));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = C.SHOP_SUB || ""));
const garmentSel = $("#inGarment");
(C.GARMENTS || []).forEach((g) => {
  const o = document.createElement("option");
  o.value = g; o.textContent = g;
  garmentSel.appendChild(o);
});
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inGarment").addEventListener("change", () => clearInvalid("garment"));

/* ---------- submit ---------- */
$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const garment = $("#inGarment").value;
  let ok = setInvalid("name", !name);
  ok = setInvalid("garment", !garment) && ok;
  if (!ok) return;

  const details = {
    garment,
    measurements: {
      chest: $("#inChest").value.trim(),
      waist: $("#inWaist").value.trim(),
      length: $("#inLength").value.trim(),
    },
    delivery: $("#inDelivery").value || "",
  };
  const note = $("#inNote").value.trim();
  const phone = $("#inPhone").value.trim();

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Placing order…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      row = {
        id: "demo-me", token: state.demoNext++, customer_name: name,
        phone: phone || null, status: "queued",
        details, note: note || null, created_at: new Date().toISOString(),
      };
    } else {
      const sb = await getClient();
      const api = queueApi(C.APP, C.TABLE);
      const token = await api.nextToken(sb);
      bar.style.width = "75%";
      const { data, error } = await sb.from(C.TABLE)
        .insert([{
          token,
          customer_name: name,
          phone: phone || null,
          status: "queued",
          details,
          note: note || null,
        }])
        .select()
        .single();
      if (error) throw new Error("Could not create order: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showToken(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Get my order number";
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
    }, 160);
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* ---------- token view ---------- */
function showToken(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#tokenNum").textContent = row.token;
  $("#dName").textContent = row.customer_name;
  $("#dGarment").textContent = (row.details && row.details.garment) || "—";
  $("#dDelivery").textContent = fmtDate(row.details && row.details.delivery);
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) { simulateDemo(); return; }
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
    : `<strong>${ahead} ahead of you.</strong> We will call order ${row.token}.`;
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
    $("#queuePos").innerHTML = `<strong>${SL.active || "Stitching"} now.</strong> Your outfit is on the machine.`;
  } else if (row.status === "done") {
    $("#queuePos").innerHTML = "<strong>Ready for pickup.</strong> Show this screen at the counter.";
  } else if (isDemo() || !isConfigured()) {
    $("#queuePos").innerHTML = `<strong>2 ahead of you.</strong> We will call order ${row.token}.`;
  }
}

/* demo: walk the order through the statuses so the preview feels alive */
function simulateDemo() {
  const seq = ["active", "done"];
  let i = 0;
  const h = setInterval(() => {
    if (i >= seq.length || $("#view-token").hidden) { clearInterval(h); return; }
    state.row.status = seq[i++];
    renderStatus(state.row);
    if (state.row.status === "done") clearInterval(h);
  }, 9000);
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#orderForm").reset();
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
