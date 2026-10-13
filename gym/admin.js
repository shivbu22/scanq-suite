/* GymQ — gym staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoMembers, demoCheckins } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const TABLE = () => cfg().TABLE || "gym_checkins";
const MTABLE = () => cfg().MEMBERS_TABLE || "gym_members";

const state = { members: [], checkins: [], tab: "checkins", muted: false, sb: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Iron Paradise Gym"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   DASHBOARD
   ================================================================ */
if (DEMO || sessionStorage.getItem("sq_admin") === "1") showDash();
else {
  $("#view-lock").hidden = false;
  $("#inPass").focus();
}
$("#btnUnlock").onclick = tryUnlock;
$("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });

async function tryUnlock() {
  const v = $("#inPass").value.trim();
  if (!v) return;
  const h = await sha256hex(v);
  const want = await effectiveHash();
  if (h === want) {
    sessionStorage.setItem("sq_admin", "1");
    showDash();
  } else {
    $("#passErr").style.display = "block";
    $("#inPass").value = "";
    $("#inPass").focus();
  }
}

/* The passcode hash lives in the DB (changeable from the dashboard);
   fall back to config.js when offline/demo/unconfigured. */
async function effectiveHash() {
  if (state.passHash) return state.passHash;
  const fallback = cfg().PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, cfg().APP || "gym", fallback);
  } catch (_) {
    state.passHash = fallback;
  }
  return state.passHash;
}

async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  await boot();
  renderDash();
}

function bindDash() {
  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
      renderDash();
    }));
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: cfg().APP || "gym",
        getSb: getClient,
        fallbackHash: cfg().PASSCODE_HASH || "",
        toast,
      });
    }
  }
  $("#btnMute").onclick = () => {
    state.muted = !state.muted;
    $("#btnMute").textContent = state.muted ? "Sound off" : "Sound on";
    $("#btnMute").setAttribute("aria-pressed", String(!state.muted));
  };
  $("#memberForm").addEventListener("submit", onAddMember);
}

async function boot() {
  if (DEMO || !isConfigured()) {
    // Offline preview: members + check-ins live in shared demo stores so the
    // customer page (even in another tab) and the dashboard see each other.
    state.mStore = demoStore(MTABLE(), demoMembers);
    state.cStore = demoStore(TABLE(), demoCheckins);
    state.members = state.mStore.read();
    state.checkins = state.cStore.read();
    state.knownCheckins = new Set(state.checkins.map((r) => r.id));
    state.cStore.onChange((rows) => {
      const fresh = rows.filter((r) => !state.knownCheckins.has(r.id));
      state.checkins = rows;
      fresh.forEach((r) => state.knownCheckins.add(r.id));
      renderDash();
      if (fresh.length) {
        if (!state.muted) chime();
        toast(`${fresh[0].member_name} checked in`);
      }
    });
    state.mStore.onChange((rows) => {
      state.members = rows;
      renderDash();
    });
  } else {
    state.sb = await getClient();
    try {
      const { data: members, error: mErr } = await state.sb.from(MTABLE()).select("*").order("name");
      if (mErr) throw mErr;
      const { data: checkins, error: cErr } = await state.sb.from(TABLE())
        .select("*").gte("created_at", todayISO()).order("created_at", { ascending: false });
      if (cErr) throw cErr;
      state.members = members || [];
      state.checkins = checkins || [];
    } catch (e) {
      toast("Could not load gym data: " + (e.message || e));
      return;
    }
    state.sb.channel(TABLE() + "-checkins")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE() }, (p) => {
        if ((p.new.created_at || "") < todayISO()) return;
        state.checkins.unshift(p.new);
        if (!state.muted) chime();
        renderDash();
        toast(`${p.new.member_name} checked in`);
      })
      .subscribe();
  }
}

/* ---------- add member ---------- */
async function onAddMember(e) {
  e.preventDefault();
  const name = $("#mName").value.trim();
  const phone = $("#mPhone").value.trim();
  const plan = $("#mPlan").value;
  const fee_due = $("#mFee").value || null;
  let ok = setInvalid("mname", !name);
  ok = setInvalid("mphone", !phone) && ok;
  if (!ok) return;
  const btn = $("#btnAddMember");
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      const member = {
        id: "demo-m-" + Date.now(), name, phone, plan, fee_due,
        created_at: new Date().toISOString(),
      };
      state.mStore.insert(member);
      state.members = state.mStore.read();
    } else {
      const { data, error } = await state.sb.from(MTABLE())
        .insert([{ name, phone, plan, fee_due }]).select().single();
      if (error) throw error;
      state.members.push(data);
      state.members.sort((a, b) => a.name.localeCompare(b.name));
    }
    $("#memberForm").reset();
    if (state.tab !== "members") {
      state.tab = "members";
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === "members" ? "true" : "false"));
    }
    renderDash();
    toast(`${name} added as a member.`);
  } catch (err) {
    toast("Could not add member: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

function setInvalid(key, bad) {
  document.querySelector(`#memberForm [data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}

/* ---------- rendering ---------- */
function isOverdue(m) {
  return m.fee_due && m.fee_due < todayISO();
}

function renderDash() {
  const today = state.checkins.filter((c) => (c.created_at || "") >= todayISO());
  const overdue = state.members.filter(isOverdue);
  $("#stToday").textContent = today.length;
  $("#stMembers").textContent = state.members.length;
  $("#stOverdue").textContent = overdue.length;
  $("#cCheckins").textContent = today.length;
  $("#cMembers").textContent = state.members.length;

  const list = $("#listWrap");
  if (state.tab === "checkins") {
    const rows = [...today].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><div class="big">No check-ins yet</div><div>Members checking in will appear here instantly.</div></div>`;
      return;
    }
    list.innerHTML = rows.map((c) => `
      <div class="qcard">
        <div class="qcard-top">
          <div class="qmeta">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="qname">${esc(c.member_name)}</span>
            </div>
            <div class="qtime">${checkinTime(c.created_at)} · ${timeAgo(c.created_at)}</div>
          </div>
        </div>
      </div>`).join("");
  } else {
    const rows = [...state.members].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><div class="big">No members yet</div><div>Add your first member below.</div></div>`;
      return;
    }
    list.innerHTML = rows.map((m) => {
      const od = isOverdue(m);
      return `<div class="qcard">
        <div class="qcard-top">
          <div class="qmeta">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="qname">${esc(m.name)}</span>
              ${od ? `<span class="st overdue">Fee overdue</span>` : ""}
            </div>
            <div class="qtime">${esc(m.phone || "")}${m.plan ? " · " + esc(m.plan) : ""}</div>
            <div style="font-size:13.5px;margin-top:2px">Fee due: <span class="${od ? "fee-overdue" : "fee-ok"}">${m.fee_due ? esc(m.fee_due) : "—"}</span></div>
          </div>
        </div>
      </div>`;
    }).join("");
  }
}

function checkinTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  } catch (_) { return ""; }
}

window.__sqBoot = true;
