/* ReviewQ — customer rating page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABLE = cfg().TABLE || "review_taps";
const GOOGLE_URL_KEY = "reviewq_google_url";

const state = { stars: 0 };

const STAR_WORDS = {
  1: "Sorry to hear that.",
  2: "Not great — we'll do better.",
  3: "Okay — thanks for the honest word.",
  4: "Good — glad you liked it!",
  5: "Excellent — you made our day!",
};

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Sharma Sweets"));
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- star picker ---------- */
$("#stars").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-star]");
  if (!btn) return;
  setStars(Number(btn.dataset.star));
});

function setStars(n) {
  state.stars = n;
  $$("#stars [data-star]").forEach((b) => {
    const v = Number(b.dataset.star);
    b.classList.toggle("on", v <= n);
    b.setAttribute("aria-checked", v === n ? "true" : "false");
  });
  $("#starLabel").textContent = STAR_WORDS[n] || "";
  $("#btnGoogle").disabled = false;
  $("#btnGoogle").textContent = n >= 4 ? "Review us on Google" : "Send my rating";
}

/* ---------- submit: log the tap, then open Google reviews ---------- */
$("#btnGoogle").addEventListener("click", async () => {
  const stars = state.stars;
  if (!stars) return;

  const url = (localStorage.getItem(GOOGLE_URL_KEY) || "").trim();
  if (url && /^https:\/\//i.test(url)) {
    // Open synchronously in the click handler so popup blockers allow it.
    // https-only: kills any residual self-XSS via a crafted URL.
    window.open(url, "_blank", "noopener");
  }

  const btn = $("#btnGoogle"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Saving…";
  prog.classList.add("show"); bar.style.width = "60%";

  try {
    if (isDemo() || !isConfigured()) {
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this tap, like the real backend.
      const store = demoStore(TABLE, demoRows);
      store.insert({
        id: "demo-" + Date.now(), stars,
        created_at: new Date().toISOString(),
      });
    } else {
      const sb = await getClient();
      const { error } = await sb.from(TABLE).insert([{ stars }]);
      if (error) throw new Error("Could not save rating: " + error.message);
    }
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
    btn.disabled = false; btn.textContent = "Review us on Google";
    prog.classList.remove("show"); bar.style.width = "0";
    return;
  }

  bar.style.width = "100%";
  setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  showThanks(stars, !!url);
});

function showThanks(stars, openedGoogle) {
  $("#view-rate").hidden = true;
  $("#view-thanks").hidden = false;
  $("#thanksNote").textContent = openedGoogle
    ? `Your ${stars}-star tap is saved — Google reviews should be opening now.`
    : `Your ${stars}-star tap is saved. Thanks for the love!`;
  window.scrollTo({ top: 0 });
}

$("#btnAgain").onclick = () => {
  setStars(0);
  $("#btnGoogle").disabled = true;
  $("#btnGoogle").textContent = "Review us on Google";
  $("#starLabel").textContent = "";
  $("#view-thanks").hidden = true;
  $("#view-rate").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
