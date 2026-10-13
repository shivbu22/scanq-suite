/* RecordQ — patient visit-history lookup page. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, signedUrl, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const C = cfg();
const TABLE = C.TABLE || "clinic_records";

const state = { store: null, sb: null, phone: null, timer: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* match on last 10 digits so "+91 98110 22334" and "9811022334" both hit */
export const normPhone = (p) => String(p || "").replace(/\D/g, "").slice(-10);

export function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return {
    day: d.getDate(),
    mon: d.toLocaleDateString("en-IN", { month: "short" }),
    full: d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
  };
}

export function visitHTML(v) {
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
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- lookup ---------- */
function setInvalid(bad) {
  document.querySelector('[data-f="phone"]').classList.toggle("invalid", bad);
  return !bad;
}
$("#inPhone").addEventListener("input", () => setInvalid(false));

$("#lookupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = $("#inPhone").value.trim();
  if (!setInvalid(normPhone(raw).length !== 10)) return;

  const btn = $("#btnLookup"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Looking up…";
  prog.classList.add("show"); bar.style.width = "50%";
  try {
    const visits = await findVisits(normPhone(raw));
    bar.style.width = "100%";
    if (!visits.length) {
      toast("No visits found for this number. Check the number and try again.");
      return;
    }
    state.phone = normPhone(raw);
    showRecord(visits);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "View my records";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

async function findVisits(phone) {
  if (isDemo() || !isConfigured()) {
    state.store = state.store || demoStore(TABLE, demoRows);
    return state.store.read()
      .filter((r) => normPhone(r.phone) === phone)
      .sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)));
  }
  state.sb = state.sb || await getClient();
  const { data, error } = await state.sb.from(TABLE)
    .select("*")
    .order("visit_date", { ascending: false });
  if (error) throw new Error("Could not load records: " + error.message);
  return (data || [])
    .filter((r) => normPhone(r.phone) === phone);
}

function showRecord(visits) {
  const v0 = visits[0];
  state.visits = visits;
  $("#recName").textContent = v0.patient_name;
  $("#recPhone").textContent = "••••• " + normPhone(v0.phone).slice(-5);
  $("#recAvatar").textContent = (v0.patient_name || "?").trim().charAt(0).toUpperCase();
  $("#visitList").innerHTML = visits.map(visitHTML).join("");
  $("#view-lookup").hidden = true;
  $("#view-record").hidden = false;
  window.scrollTo({ top: 0 });
  watchForUpdates();
}

/* live updates in demo: a new visit added on the dashboard appears here */
function watchForUpdates() {
  if (state.timer || !state.store) return;
  state.timer = setInterval(async () => {
    if (!state.phone || $("#view-record").hidden) return;
    const visits = await findVisits(state.phone);
    const cur = $("#visitList").querySelectorAll(".visit").length;
    if (visits.length !== cur) showRecord(visits);
  }, 2000);
}

/* ---------- prescription viewing (delegated once) ---------- */
$("#visitList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-rx]");
  if (!btn) return;
  const v = (state.visits || []).find((x) => String(x.id) === btn.dataset.rx);
  if (!v || !v.prescription_url) return;
  btn.disabled = true;
  try {
    if (v.prescription_url.startsWith("data:")) {
      window.open(v.prescription_url, "_blank", "noopener");
    } else {
      const sb = state.sb || await getClient();
      const url = await signedUrl(sb, v.prescription_url, 3600);
      window.open(url, "_blank", "noopener");
    }
  } catch (err) {
    toast("Could not open prescription: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
});

$("#btnAgain").onclick = () => {
  state.phone = null;
  $("#inPhone").value = "";
  $("#view-record").hidden = true;
  $("#view-lookup").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
