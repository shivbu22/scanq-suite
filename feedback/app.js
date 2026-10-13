/* FeedbackQ — customer feedback form logic. */
import { cfg, isConfigured, isDemo, getClient, esc } from "../shared/sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = { rating: 0 };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Stationery Shop"));
document.querySelectorAll("[data-shop-sub]").forEach((el) => (el.textContent = cfg().SHOP_SUB || "Customer feedback box"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* categories from config */
const sel = $("#inCategory");
(cfg().CATEGORIES || ["Other"]).forEach((c, i) => {
  const o = document.createElement("option");
  o.value = c;
  o.textContent = c;
  if (i === 0) o.selected = true;
  sel.appendChild(o);
});

/* ---------- star input (radiogroup: mouse, touch, keyboard) ---------- */
const starBox = $("#stars");
const starBtns = $$("#stars button");

function paint(n) {
  starBtns.forEach((b) => {
    const v = Number(b.dataset.v);
    b.classList.toggle("lit", v <= n);
    b.setAttribute("aria-checked", v === state.rating ? "true" : "false");
  });
}

starBox.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.rating = Number(b.dataset.v);
  paint(state.rating);
  clearInvalid("rating");
  b.focus();
});
starBox.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  e.preventDefault();
  state.rating = Math.min(5, Math.max(1, state.rating + (e.key === "ArrowRight" ? 1 : -1)));
  paint(state.rating);
  clearInvalid("rating");
  starBtns[state.rating - 1].focus();
});

/* ---------- anonymous toggle ---------- */
$("#inAnon").addEventListener("change", (e) => {
  $("#inName").disabled = e.target.checked;
  $("#inName").style.opacity = e.target.checked ? "0.45" : "1";
});
$("#inComment").addEventListener("input", () => clearInvalid("comment"));

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }

/* ---------- submit ---------- */
$("#fbForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const comment = $("#inComment").value.trim();
  let ok = setInvalid("rating", state.rating < 1);
  ok = setInvalid("comment", comment.length < 3) && ok;
  if (!ok) return;

  const anon = $("#inAnon").checked;
  const name = $("#inName").value.trim();
  const payload = {
    rating: state.rating,
    category: sel.value,
    comment,
    name: anon ? null : (name || null),
    status: "new",
  };

  const btn = $("#btnSubmit");
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    if (!isDemo() && isConfigured()) {
      const sb = await getClient();
      const { error } = await sb.from(cfg().TABLE || "feedback").insert([payload]);
      if (error) throw new Error("Could not send: " + error.message);
    } else {
      await new Promise((r) => setTimeout(r, 700)); // demo beat
    }
    showThanks(state.rating);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Send feedback";
  }
});

function starsHTML(n, big) {
  return `<span class="${big ? "stars-big" : "stars-view"}" role="img" aria-label="${n} out of 5 stars">` +
    `<span class="on">${"★".repeat(n)}</span><span class="off">${"★".repeat(5 - n)}</span></span>`;
}

function showThanks(rating) {
  $("#view-form").hidden = true;
  $("#thStars").innerHTML = starsHTML(rating, true);
  $("#view-thanks").hidden = false;
  window.scrollTo({ top: 0 });
}

$("#btnAnother").onclick = () => {
  state.rating = 0; paint(0);
  $("#fbForm").reset();
  $("#inName").disabled = false; $("#inName").style.opacity = "1";
  $("#view-thanks").hidden = true;
  $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
