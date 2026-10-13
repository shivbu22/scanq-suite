/* LoyaltyQ — shop staff dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, timeAgo, chime, sha256hex, demoStore,
  getPasscodeHash, openPasscodeModal,
} from "../shared/sq.js";
import { demoMembers, demoEvents } from "./demo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DEMO = isDemo();
const TARGET = cfg().REWARD_TARGET || 10;
const MEMBERS = cfg().TABLE || "loyalty_members";
const EVENTS = cfg().EVENTS_TABLE || "loyalty_events";

const state = { members: [], events: [], tab: "members", sb: null, lookupId: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}
function normPhone(p) { return String(p || "").replace(/\D/g, ""); }

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Chai Point"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   PASSCODE GATE
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

async function effectiveHash() {
  if (state.passHash) return state.passHash;
  const fallback = cfg().PASSCODE_HASH || "";
  if (DEMO || !isConfigured()) return fallback;
  try {
    const sb = await getClient();
    state.passHash = await getPasscodeHash(sb, cfg().APP || "loyalty", fallback);
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
}

/* ================================================================
   DATA
   ================================================================ */
function bindDash() {
  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
      $("#tab-members").hidden = state.tab !== "members";
      $("#tab-activity").hidden = state.tab !== "activity";
      renderDash();
    }));
  const btnPass = $("#btnPasscode");
  if (btnPass) {
    if (DEMO || !isConfigured()) {
      btnPass.hidden = true; // nowhere to save it without the backend
    } else {
      btnPass.onclick = () => openPasscodeModal({
        app: cfg().APP || "loyalty",
        getSb: getClient,
        fallbackHash: cfg().PASSCODE_HASH || "",
        toast,
      });
    }
  }
  $("#btnLookup").onclick = lookupMember;
  $("#inLkPhone").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lookupMember(); } });
  $("#inLkPhone").addEventListener("input", () => setInvalid("lkPhone", false));
  $("#inLkName").addEventListener("input", () => setInvalid("lkName", false));
  $("#inSearch").addEventListener("input", renderMembers);
  $("#memberCard").addEventListener("click", onMemberCardAction);
  $("#memberList").addEventListener("click", onMemberListAction);
}

async function boot() {
  if (DEMO || !isConfigured()) {
    state.mstore = demoStore(MEMBERS, demoMembers);
    state.estore = demoStore(EVENTS, demoEvents);
    state.members = state.mstore.read();
    state.events = state.estore.read();
    const rerender = () => {
      state.members = state.mstore.read();
      state.events = state.estore.read();
      renderDash();
      if (state.lookupId) renderLookupCard();
    };
    state.mstore.onChange(rerender);
    state.estore.onChange(rerender);
  } else {
    state.sb = await getClient();
    try {
      const [m, e] = await Promise.all([
        state.sb.from(MEMBERS).select("*").order("created_at", { ascending: false }).limit(500),
        state.sb.from(EVENTS).select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      if (m.error) throw m.error;
      if (e.error) throw e.error;
      state.members = m.data || [];
      state.events = e.data || [];
    } catch (err) {
      toast("Could not load members: " + (err.message || err));
      return;
    }
    state.sb
      .channel("loyalty-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: MEMBERS }, (p) => {
        applyMember(p.new);
        renderDash();
        if (state.lookupId) renderLookupCard();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: EVENTS }, (p) => {
        state.events.unshift(p.new);
        renderDash();
      })
      .subscribe();
  }
  renderDash();
}

function applyMember(row) {
  const i = state.members.findIndex((m) => m.id === row.id);
  if (i >= 0) state.members[i] = row;
  else state.members.unshift(row);
}

function persistMember(id, patch) {
  if (DEMO || !isConfigured()) state.mstore.update(id, patch);
  else return state.sb.from(MEMBERS).update(patch).eq("id", id);
}

function insertEvent(member_id, kind) {
  const row = {
    id: DEMO || !isConfigured() ? "le-" + Date.now() : undefined,
    member_id, kind, created_at: new Date().toISOString(),
  };
  if (DEMO || !isConfigured()) {
    state.estore.insert(row);
    // the storage event only fires in other tabs — update our own copy too
    state.events.unshift(row);
    return Promise.resolve();
  }
  const { id: _omit, ...payload } = row;
  return state.sb.from(EVENTS).insert([payload]).then(({ error }) => { if (error) throw error; });
}

function createMember(name, phone) {
  const row = {
    id: DEMO || !isConfigured() ? "lm-" + Date.now() : undefined,
    name, phone, stamps: 0, rewards_earned: 0,
    created_at: new Date().toISOString(),
  };
  if (DEMO || !isConfigured()) { state.mstore.insert(row); return Promise.resolve(row); }
  const { id: _omit, ...payload } = row;
  return state.sb.from(MEMBERS).insert([payload]).select().single()
    .then(({ data, error }) => { if (error) throw error; return data; });
}

/* ================================================================
   COUNTER — lookup, add stamp, redeem
   ================================================================ */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`)?.classList.toggle("invalid", bad);
  return !bad;
}

async function lookupMember() {
  const phone = $("#inLkPhone").value.trim();
  if (!setInvalid("lkPhone", normPhone(phone).length < 6)) return;
  $("#lkNameWrap").hidden = true;
  state.lookupId = null;
  $("#memberCard").innerHTML = "";

  const found = state.members.find((m) => normPhone(m.phone) === normPhone(phone));
  if (found) {
    state.lookupId = found.id;
    renderLookupCard();
  } else {
    // New member: ask for the name, then create with the first stamp.
    $("#lkNameWrap").hidden = false;
    $("#inLkName").value = "";
    $("#memberCard").innerHTML = `
      <div class="empty" style="margin-top:12px">
        <div class="big">New member</div>
        <div>No card for ${esc(phone)} yet. Enter the name above, then:</div>
        <div style="height:10px"></div>
        <button class="btn primary" data-act="create" style="width:auto">Create card + give first stamp</button>
      </div>`;
    $("#inLkName").focus();
  }
}

function renderLookupCard() {
  const m = state.members.find((x) => x.id === state.lookupId);
  if (!m) { $("#memberCard").innerHTML = ""; return; }
  const ready = (m.stamps || 0) >= TARGET;
  $("#memberCard").innerHTML = `
    <div class="qcard" style="margin-top:14px" data-id="${m.id}">
      <div class="qcard-top">
        <div class="qtoken" style="font-size:26px">${m.stamps || 0}<span style="font-size:14px;color:var(--faint)">/${TARGET}</span></div>
        <div class="qmeta">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="qname">${esc(m.name || "Member")}</span>
            ${ready ? `<span class="st" style="background:var(--brand-soft);color:var(--brand-deep)">Reward ready</span>` : ""}
          </div>
          <div class="qtime">${esc(m.phone || "")} · ${m.rewards_earned || 0} rewards earned</div>
          <div class="minibar${ready ? " full" : ""}"><i style="width:${Math.min(100, ((m.stamps || 0) / TARGET) * 100)}%"></i></div>
        </div>
      </div>
      <div class="qactions">
        ${ready
          ? `<button class="btn primary small" data-act="redeem" style="width:auto">Redeem free chai</button>`
          : `<button class="btn primary small" data-act="stamp" style="width:auto">Add stamp</button>`}
        <a class="btn ghost small" style="width:auto;text-decoration:none" href="index.html?phone=${encodeURIComponent(m.phone || "")}" target="_blank" rel="noopener">View card</a>
      </div>
    </div>`;
}

async function onMemberCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  btn.disabled = true;
  try {
    if (act === "create") {
      const phone = $("#inLkPhone").value.trim();
      const name = $("#inLkName").value.trim();
      if (!setInvalid("lkName", !name)) return;
      if (state.members.some((m) => normPhone(m.phone) === normPhone(phone))) {
        toast("A card for this number already exists.");
        lookupMember();
        return;
      }
      const created = await createMember(name, phone);
      applyMember(created);
      state.lookupId = created.id;
      await giveStamp(created.id);
      $("#lkNameWrap").hidden = true;
      toast(`Card created for ${name} — 1 stamp added.`);
    } else if (act === "stamp") {
      const m = state.members.find((x) => x.id === state.lookupId);
      if (!m) return;
      if ((m.stamps || 0) >= TARGET) { toast("Card is full — redeem the reward first."); return; }
      await giveStamp(m.id);
      chime();
    } else if (act === "redeem") {
      const m = state.members.find((x) => x.id === state.lookupId);
      if (!m || (m.stamps || 0) < TARGET) return;
      await insertEvent(m.id, "redeem");
      const patch = { stamps: 0, rewards_earned: (m.rewards_earned || 0) + 1 };
      await persistMember(m.id, patch);
      applyMember({ ...m, ...patch });
      chime();
      toast(`Reward redeemed for ${m.name || "member"} — free chai!`);
    }
  } catch (err) {
    toast("Failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
    renderLookupCard();
    renderDash();
  }
}

async function giveStamp(id) {
  const m = state.members.find((x) => x.id === id);
  if (!m) return;
  const next = Math.min(TARGET, (m.stamps || 0) + 1);
  await insertEvent(id, "stamp");
  const patch = { stamps: next };
  await persistMember(id, patch);
  applyMember({ ...m, ...patch });
  if (next >= TARGET) toast("Card full — reward ready to redeem!");
  else toast(`Stamp added — ${next} of ${TARGET}.`);
}

/* ================================================================
   RENDERING
   ================================================================ */
function isToday(iso) { return (iso || "").slice(0, 10) >= todayISO(); }

function renderDash() {
  const membersToday = state.members.filter((m) => isToday(m.created_at)).length;
  const stampsToday = state.events.filter((e) => e.kind === "stamp" && isToday(e.created_at)).length;
  const rewardsToday = state.events.filter((e) => e.kind === "redeem" && isToday(e.created_at)).length;
  $("#stMembers").textContent = membersToday;
  $("#stStamps").textContent = stampsToday;
  $("#stRewards").textContent = rewardsToday;
  $("#stStamps").closest(".stat").classList.toggle("hot", stampsToday > 0);
  $("#cMembers").textContent = state.members.length;
  renderMembers();
  renderEvents();
}

function renderMembers() {
  const q = $("#inSearch").value.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const list = $("#memberList");
  const rows = state.members
    .filter((m) =>
      !q ||
      (m.name || "").toLowerCase().includes(q) ||
      (digits && normPhone(m.phone).includes(digits)))
    .slice(0, 100);
  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">No members</div><div>Stamp cards appear here as you add them at the counter.</div></div>`;
    return;
  }
  list.innerHTML = rows.map((m) => {
    const ready = (m.stamps || 0) >= TARGET;
    return `<div class="qcard" data-id="${m.id}">
      <div class="qcard-top">
        <div class="qtoken" style="font-size:22px">${m.stamps || 0}<span style="font-size:13px;color:var(--faint)">/${TARGET}</span></div>
        <div class="qmeta">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="qname">${esc(m.name || "Member")}</span>
            ${ready ? `<span class="st" style="background:var(--brand-soft);color:var(--brand-deep)">Reward ready</span>` : ""}
          </div>
          <div class="qtime">${esc(m.phone || "")} · ${m.rewards_earned || 0} rewards · joined ${timeAgo(m.created_at)}</div>
          <div class="minibar${ready ? " full" : ""}"><i style="width:${Math.min(100, ((m.stamps || 0) / TARGET) * 100)}%"></i></div>
        </div>
      </div>
      <div class="qactions">
        <button class="btn ghost small" data-act="select" style="width:auto">Open at counter</button>
      </div>
    </div>`;
  }).join("");
}

function onMemberListAction(e) {
  const btn = e.target.closest("[data-act='select']");
  if (!btn) return;
  const id = btn.closest("[data-id]").dataset.id;
  const m = state.members.find((x) => x.id === id);
  if (!m) return;
  $("#inLkPhone").value = m.phone || "";
  $("#lkNameWrap").hidden = true;
  state.lookupId = id;
  renderLookupCard();
  $("#memberCard").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderEvents() {
  const list = $("#eventList");
  const byId = Object.fromEntries(state.members.map((m) => [m.id, m]));
  const rows = [...state.events]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 60);
  if (!rows.length) {
    list.innerHTML = `<div class="empty"><div class="big">No activity yet</div><div>Stamps and redemptions will show up here.</div></div>`;
    return;
  }
  list.innerHTML = rows.map((e) => {
    const m = byId[e.member_id] || {};
    const label = e.kind === "redeem" ? "Redeemed reward" : "Stamp given";
    const chip = e.kind === "redeem"
      ? `<span class="st" style="background:var(--brand-deep);color:#fff">reward</span>`
      : `<span class="st" style="background:var(--brand-soft);color:var(--brand-deep)">stamp</span>`;
    return `<div class="qcard">
      <div class="qcard-top">
        <div class="qmeta">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="qname">${esc(m.name || "Member")}</span>${chip}
          </div>
          <div class="qtime">${esc(m.phone || "")} · ${label} · ${timeAgo(e.created_at)}</div>
        </div>
      </div>
    </div>`;
  }).join("");
}

window.__sqBoot = true;
