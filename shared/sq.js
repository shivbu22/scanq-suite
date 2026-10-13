/* ScanQ Suite — shared helpers (ES module). Used by all suite apps. */

export const cfg = () => window.SQ || {};

export function isConfigured() {
  const c = cfg();
  return !!(
    c.SUPABASE_URL &&
    c.SUPABASE_ANON_KEY &&
    !c.SUPABASE_URL.includes("YOUR-PROJECT") &&
    !c.SUPABASE_ANON_KEY.includes("YOUR-ANON")
  );
}

export function isDemo() {
  return new URLSearchParams(location.search).get("demo") === "1";
}

let _client = null;
export async function getClient() {
  if (_client) return _client;
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.44.4/+esm"
  );
  const c = cfg();
  _client = createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
  return _client;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}

export function fmtBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

export function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  return Math.round(m / 60) + "h ago";
}

export function shortFileName(path) {
  const base = String(path).split("/").pop() || path;
  return base.replace(/^[0-9a-f-]{36}_/, "");
}

/* Generic queue-table API. `app` is the schema prefix ("clinic"), `table` the full name. */
export function queueApi(app, table) {
  return {
    async nextToken(client) {
      const { data, error } = await client.rpc("next_queue_token", { p_app: app });
      if (error) throw error;
      return data;
    },
    async today(client) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .gte("created_at", todayISO())
        .order("token", { ascending: true });
      if (error) throw error;
      return data;
    },
    onInsert(client, cb) {
      return client
        .channel(table + "-inserts")
        .on("postgres_changes", { event: "INSERT", schema: "public", table }, (p) => cb(p.new))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table }, (p) => cb(p.new, true))
        .subscribe();
    },
    onRow(client, id, cb) {
      return client
        .channel(table + "-" + id)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table, filter: "id=eq." + id },
          (p) => cb(p.new))
        .subscribe();
    },
    async update(client, id, patch) {
      const { error } = await client.from(table).update(patch).eq("id", id);
      if (error) throw error;
    },
  };
}

/* Upload a file to the shared "documents" bucket. Returns the storage path. */
export async function uploadFile(client, file, onProgress) {
  const path = crypto.randomUUID() + "_" + file.name.replace(/[^\w.\-]+/g, "_");
  const { error } = await client.storage.from("documents").upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  if (onProgress) onProgress(1);
  return path;
}

export async function signedUrl(client, path, seconds = 600) {
  const { data, error } = await client.storage.from("documents").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/* Two-tone counter chime (WebAudio, no audio file needed). */
export function chime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    [523.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  } catch (_) { /* audio unavailable — stay silent */ }
}

export async function sha256hex(str) {
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "plain:" + str;
}

/* ---------- admin passcode (changeable from the dashboard) ----------
   The sha256 hash lives in the app_settings table so the owner can change
   it from any device. Same "speed bump, not real security" model as the
   rest of the anon dashboard. */
export async function getPasscodeHash(sb, app, fallback) {
  try {
    const { data, error } = await sb.from("app_settings")
      .select("passcode_hash").eq("app", app).maybeSingle();
    if (!error && data?.passcode_hash) return data.passcode_hash;
  } catch (_) { /* fall through to config hash */ }
  return fallback;
}

export async function setPasscodeHash(sb, app, hash) {
  const { error } = await sb.from("app_settings")
    .upsert({ app, passcode_hash: hash }, { onConflict: "app" });
  if (error) throw error;
}

/* Opens a "Change passcode" modal. opts: { app, getSb, fallbackHash, toast }.
   Verifies the current passcode, then writes the new sha256 hash. */
export function openPasscodeModal({ app, getSb, fallbackHash, toast }) {
  const overlay = document.createElement("div");
  overlay.className = "sq-modal-overlay";
  overlay.innerHTML = `
    <div class="sq-modal" role="dialog" aria-label="Change passcode">
      <h3>Change dashboard passcode</h3>
      <p class="sub">Only someone who knows the current passcode can change it.</p>
      <div class="field"><label>Current passcode</label>
        <input type="password" id="pcCur" inputmode="numeric" autocomplete="off" /></div>
      <div class="field"><label>New passcode (min 4 digits)</label>
        <input type="password" id="pcNew" inputmode="numeric" autocomplete="new-password" /></div>
      <div class="field"><label>Confirm new passcode</label>
        <input type="password" id="pcConf" inputmode="numeric" autocomplete="new-password" /></div>
      <div class="sq-modal-err" id="pcErr" hidden></div>
      <div class="sq-modal-actions">
        <button class="btn ghost" id="pcCancel" type="button">Cancel</button>
        <button class="btn primary" id="pcSave" type="button">Save new passcode</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const err = (m) => {
    const e = overlay.querySelector("#pcErr");
    e.textContent = m; e.hidden = !m;
  };
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#pcCancel").onclick = close;
  overlay.querySelector("#pcCur").focus();
  overlay.querySelector("#pcSave").onclick = async () => {
    const cur = overlay.querySelector("#pcCur").value.trim();
    const nw = overlay.querySelector("#pcNew").value.trim();
    const cf = overlay.querySelector("#pcConf").value.trim();
    err("");
    if (nw.length < 4) return err("New passcode must be at least 4 characters.");
    if (nw !== cf) return err("New passcodes do not match.");
    const btn = overlay.querySelector("#pcSave");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const sb = await getSb();
      const want = await getPasscodeHash(sb, app, fallbackHash);
      if (await sha256hex(cur) !== want) { err("Current passcode is wrong."); return; }
      await setPasscodeHash(sb, app, await sha256hex(nw));
      close();
      toast("Passcode changed. Use the new one next time you unlock.");
    } catch (e2) {
      err("Could not save: " + (e2.message || e2));
    } finally {
      btn.disabled = false; btn.textContent = "Save new passcode";
    }
  };
}
/* Demo store: a shared localStorage "database" so that in ?demo=1 the
   customer page and the dashboard see each other's rows — even across
   tabs — the way the real backend links them. The seed is persisted on
   first read, so every tab shares one consistent demo world. */
export function demoStore(key, seedFn) {
  const K = "scanq-demo-v1-" + key;
  function read() {
    try {
      const raw = localStorage.getItem(K);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* storage unavailable — fall through to seed */ }
    const s = seedFn() || [];
    write(s);
    return s;
  }
  function write(rows) {
    try { localStorage.setItem(K, JSON.stringify(rows)); } catch (_) { /* ignore */ }
  }
  return {
    read,
    insert(row) {
      const rows = read();
      if (!rows.some((r) => r.id === row.id)) rows.push(row);
      write(rows);
    },
    update(id, patch) {
      write(read().map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    onChange(cb) {
      window.addEventListener("storage", (e) => {
        if (e.key === K) {
          try { cb(JSON.parse(e.newValue || "[]")); } catch (_) { /* ignore */ }
        }
      });
    },
  };
}
