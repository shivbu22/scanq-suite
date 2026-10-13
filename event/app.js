/* EventQ — customer RSVP logic. No tokens here: one RSVP = one guest entry. */
import {
  cfg, isConfigured, isDemo, getClient, esc, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const TABLE = () => cfg().TABLE || "event_rsvp";

const state = { headcount: 2 };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "EventQ"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- headcount stepper ---------- */
function renderHc() { $("#hcNum").textContent = state.headcount; }
$("#btnMinus").onclick = () => { state.headcount = Math.max(1, state.headcount - 1); renderHc(); };
$("#btnPlus").onclick = () => { state.headcount = Math.min(20, state.headcount + 1); renderHc(); };
renderHc();

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
$("#inName").addEventListener("input", () => setInvalid("name", false));

/* ---------- submit ---------- */
$("#rsvpForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const event_name = $("#inEvent").value.trim() || "Event";
  const guest_name = $("#inName").value.trim();
  if (!setInvalid("name", !guest_name)) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Saving…";
  prog.classList.add("show"); bar.style.width = "40%";

  const phone = $("#inPhone").value.trim() || null;
  try {
    if (isDemo() || !isConfigured()) {
      await new Promise((res) => setTimeout(res, 500));
      bar.style.width = "100%";
      if (isDemo()) {
        // Write the RSVP to the shared demo store so the host dashboard
        // (even in another tab) sees this tap, like the real backend.
        const store = demoStore(TABLE(), demoRows);
        const rows = store.read();
        const dup = rows.find((r) =>
          (r.guest_name || "").toLowerCase() === guest_name.toLowerCase() &&
          (r.event_name || "").toLowerCase() === event_name.toLowerCase());
        if (dup) {
          store.update(dup.id, { headcount: state.headcount, phone, created_at: new Date().toISOString() });
        } else {
          store.insert({
            id: "demo-" + Date.now(), event_name, guest_name, phone,
            headcount: state.headcount, checked_in: false,
            created_at: new Date().toISOString(),
          });
        }
      }
    } else {
      const sb = await getClient();
      const { error } = await sb.from(TABLE()).insert([{
        event_name, guest_name, phone,
        headcount: state.headcount, checked_in: false,
      }]);
      if (error) throw new Error("Could not save RSVP: " + error.message);
      bar.style.width = "100%";
    }
    showDone(event_name, guest_name, state.headcount);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Confirm RSVP";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

/* ---------- confirmation ---------- */
function showDone(event_name, guest_name, headcount) {
  $("#view-form").hidden = true;
  $("#view-done").hidden = false;
  $("#dEvent").textContent = event_name;
  $("#dName").textContent = guest_name;
  $("#dHead").textContent = headcount + (headcount === 1 ? " guest" : " guests");
  window.scrollTo({ top: 0 });
}

$("#btnAgain").onclick = () => {
  $("#rsvpForm").reset();
  $("#inEvent").value = "Sharma Wedding";
  state.headcount = 2; renderHc();
  $("#view-done").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
