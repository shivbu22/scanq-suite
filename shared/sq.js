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
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
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
