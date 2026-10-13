/* LibraryQ — customer book-issue page logic. */
import {
  cfg, isConfigured, isDemo, getClient,
  esc, demoStore,
} from "../shared/sq.js";
import { demoRows } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = { row: null, channel: null, demoStore: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

const LOAN_DAYS = cfg().LOAN_DAYS || 14;

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "City Library"));
$("#loanDays").textContent = LOAN_DAYS;
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));
$("#inBook").addEventListener("input", () => clearInvalid("book"));

/* ---------- submit ---------- */
$("#issueForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  const book = $("#inBook").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("book", !book) && ok;
  if (!ok) return;

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Issuing…";
  prog.classList.add("show"); bar.style.width = "30%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      // Offline preview: write to the shared demo store so the dashboard
      // (even in another tab) sees this loan, like the real backend.
      const store = demoStore(cfg().TABLE || "library_loans", demoRows);
      const today = new Date();
      const due = new Date(today.getTime() + LOAN_DAYS * 86400000);
      row = {
        id: "demo-" + Date.now(),
        member_name: name,
        phone: $("#inPhone").value.trim() || null,
        book_title: book,
        issued_date: today.toISOString().slice(0, 10),
        due_date: due.toISOString().slice(0, 10),
        returned: false,
        created_at: new Date().toISOString(),
      };
      store.insert(row);
      state.demoStore = store;
    } else {
      const sb = await getClient();
      bar.style.width = "70%";
      const { data, error } = await sb.from(cfg().TABLE)
        .insert([{
          member_name: name,
          phone: $("#inPhone").value.trim() || null,
          book_title: book,
        }])
        .select()
        .single();
      if (error) throw new Error("Could not issue book: " + error.message);
      bar.style.width = "100%";
      row = data;
    }
    showLoan(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Issue this book";
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

/* ---------- loan view ---------- */
function showLoan(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-loan").hidden = false;
  $("#dueDate").textContent = fmtDate(row.due_date);
  $("#dName").textContent = row.member_name;
  $("#dBook").textContent = row.book_title;
  renderLoan(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) {
    // Follow this loan live via the shared demo store — the dashboard
    // (even in another tab) drives the returned flag, like the real backend.
    const store = state.demoStore || demoStore(cfg().TABLE || "library_loans", demoRows);
    store.onChange((rows) => {
      const r = rows.find((x) => x.id === state.row.id);
      if (r && r.returned !== state.row.returned) {
        state.row = r;
        renderLoan(r);
      }
    });
    return;
  }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = sb.channel("loan-" + row.id)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: cfg().TABLE,
        filter: `id=eq.${row.id}`,
      }, (payload) => { state.row = payload.new; renderLoan(payload.new); })
      .subscribe();
  });
}

function renderLoan(row) {
  if (row.returned) {
    $("#loanPos").innerHTML = "<strong>Returned.</strong> Thank you — happy reading!";
    $("#dStatus").textContent = "Returned";
  } else {
    $("#loanPos").innerHTML = `<strong>Return by ${esc(fmtDate(row.due_date))}.</strong> Show this screen at the desk.`;
    $("#dStatus").textContent = "On loan";
  }
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null;
  $("#issueForm").reset();
  $("#view-loan").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
