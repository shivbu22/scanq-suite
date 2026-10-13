/* MessCount — customer RSVP logic. No tokens here: one tap = one headcount. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO, esc,
} from "../shared/sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABLE = () => cfg().TABLE || "mess_rsvp";

const state = { meal: "lunch", eating: true };

const MEAL_LABEL = { lunch: "Lunch", dinner: "Dinner" };
const MEAL_TIME = { lunch: "1 PM", dinner: "8 PM" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Mess"));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = cfg().SHOP_SUB || ""));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- segmented controls ---------- */
function bindSeg(id, key) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state[key === "meal" ? "meal" : "eating"] = key === "meal" ? b.dataset.v : b.dataset.v === "yes";
    $$(id + " button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    $("#btnSubmit").textContent = state.eating ? "Count me in" : "Confirm skip";
  });
}
bindSeg("#segMeal", "meal");
bindSeg("#segEat", "eat");

/* ---------- local dedupe: one response per name+meal per day ---------- */
const storeKey = () => `messcount:${todayISO()}`;
function readStore() {
  try { return JSON.parse(localStorage.getItem(storeKey()) || "null"); }
  catch (_) { return null; }
}
function writeStore(entry) {
  try { localStorage.setItem(storeKey(), JSON.stringify(entry)); } catch (_) {}
}
function clearStore() {
  try { localStorage.removeItem(storeKey()); } catch (_) {}
}

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
$("#inName").addEventListener("input", () => setInvalid("name", false));

/* ---------- submit ---------- */
$("#rsvpForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  if (!setInvalid("name", !name)) return;

  const existing = readStore();
  if (existing && existing.name.toLowerCase() === name.toLowerCase() && existing.meal === state.meal) {
    toast("Already counted for " + MEAL_LABEL[state.meal] + " today.");
    showDone(existing);
    return;
  }

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Saving…";
  prog.classList.add("show"); bar.style.width = "40%";

  const entry = { name, meal: state.meal, eating: state.eating };
  try {
    if (isDemo() || !isConfigured()) {
      await new Promise((res) => setTimeout(res, 500));
      bar.style.width = "100%";
    } else {
      const sb = await getClient();
      const { error } = await sb.from(TABLE()).insert([{
        name, meal: state.meal, eating: state.eating, rsvp_date: todayISO(),
      }]);
      if (error) throw new Error("Could not save: " + error.message);
      bar.style.width = "100%";
    }
    writeStore(entry);
    showDone(entry);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = state.eating ? "Count me in" : "Confirm skip";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

/* ---------- confirmation ---------- */
function showDone(entry) {
  $("#view-form").hidden = true;
  $("#view-done").hidden = false;
  const tick = $("#doneTick");
  if (entry.eating) {
    tick.classList.remove("skip");
    tick.textContent = "✓";
    $("#doneTitle").textContent = `Counted for ${MEAL_LABEL[entry.meal]}`;
    $("#doneSub").textContent = `See you at ${MEAL_TIME[entry.meal]}.`;
  } else {
    tick.classList.add("skip");
    tick.textContent = "–";
    $("#doneTitle").textContent = `Skipping ${MEAL_LABEL[entry.meal]}`;
    $("#doneSub").textContent = "Noted — we'll see you next time.";
  }
  window.scrollTo({ top: 0 });
}

$("#btnChange").onclick = () => {
  clearStore();
  $("#rsvpForm").reset();
  state.meal = "lunch"; state.eating = true;
  $$("#segMeal button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === "lunch" ? "true" : "false"));
  $$("#segEat button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === "yes" ? "true" : "false"));
  $("#btnSubmit").textContent = "Count me in";
  $("#view-done").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

/* resume today's response if already submitted on this device */
const saved = readStore();
if (saved) showDone(saved);

window.__sqBoot = true;
