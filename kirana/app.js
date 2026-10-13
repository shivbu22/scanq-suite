/* KiranaQ — customer order logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo,
} from "../shared/sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABLE = () => cfg().TABLE || "kirana_queue";
const APP = () => cfg().APP || "kirana";

const state = { row: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Store"));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = cfg().SHOP_SUB || ""));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- item checklist ---------- */
const itemList = $("#itemList");

function addItemRow(label, checked) {
  const lab = document.createElement("label");
  lab.className = "checkrow";
  lab.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""} /><span></span>`;
  lab.querySelector("span").textContent = label;
  lab.querySelector("input").addEventListener("change", () => { updateCount(); clearInvalid("items"); });
  itemList.appendChild(lab);
  updateCount();
}

function selectedItems() {
  return $$("#itemList .checkrow").filter((l) => l.querySelector("input").checked)
    .map((l) => l.querySelector("span").textContent);
}

function updateCount() {
  const n = selectedItems().length;
  $("#itemCount").textContent = n ? `· ${n} selected` : "";
}

(cfg().ITEMS || []).forEach((it) => addItemRow(it, false));

$("#btnAddOther").onclick = () => {
  const v = $("#inOther").value.trim();
  if (!v) return;
  const dup = selectedItems().some((s) => s.toLowerCase() === v.toLowerCase());
  if (dup) { toast("That's already on your list."); return; }
  addItemRow(v, true);
  $("#inOther").value = "";
  clearInvalid("items");
};
$("#inOther").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("#btnAddOther").click(); }
});

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));

/* ---------- submit ---------- */
$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const items = selectedItems();
  let ok = setInvalid("name", !name);
  ok = setInvalid("items", items.length === 0) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Placing order…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      row = {
        id: "demo-me", created_at: new Date().toISOString(),
        token: 23, customer_name: name,
        phone: $("#inPhone").value.trim(),
        details: { items }, status: "queued",
        created_at: new Date().toISOString(),
      };
    } else {
      const sb = await getClient();
      const { data: token, error: tokErr } = await sb.rpc("next_queue_token", { p_app: APP() });
      if (tokErr) throw new Error("Could not get order number: " + tokErr.message);
      bar.style.width = "65%";
      const { data, error: insErr } = await sb.from(TABLE())
        .insert([{
          created_at: new Date().toISOString(),
          token: token,
          customer_name: name,
          phone: $("#inPhone").value.trim() || null,
          details: { items },
          status: "queued",
        }])
        .select()
        .single();
      if (insErr) throw new Error("Could not place order: " + insErr.message);
      bar.style.width = "100%";
      row = data;
    }
    showOrder(row);
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

/* ---------- order view ---------- */
function itemSummary(items) {
  if (!items || !items.length) return "–";
  if (items.length <= 3) return items.join(", ");
  return items.slice(0, 3).join(", ") + ` +${items.length - 3} more`;
}

function showOrder(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#tokenNum").textContent = row.token;
  $("#dName").textContent = row.customer_name;
  $("#dItems").textContent = itemSummary((row.details || {}).items);
  $("#dItems").title = ((row.details || {}).items || []).join(", ");
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) { simulateDemo(); return; }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = sb
      .channel("order-" + row.id)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: TABLE(), filter: `id=eq.${row.id}` },
        (p) => { state.row = p.new; renderStatus(p.new); })
      .subscribe();
    refreshPosition(sb);
  });
}

async function refreshPosition(sb) {
  const row = state.row;
  if (!row || row.status !== "queued") return;
  const { count } = await sb.from(TABLE())
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
  });
  if (row.status === "active") {
    $("#queuePos").innerHTML = "<strong>Being packed now.</strong> Almost ready.";
  } else if (row.status === "done") {
    $("#queuePos").innerHTML = "<strong>Ready for pickup.</strong> Show this screen at the counter.";
  } else if (isDemo() || !isConfigured()) {
    $("#queuePos").innerHTML = "<strong>2 ahead of you.</strong> We will call order " + row.token + ".";
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
  $$("#itemList input").forEach((c) => (c.checked = false));
  updateCount();
  $("#orderForm").reset();
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
