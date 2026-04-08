// analytics/events.js
// JSONL events: read/parse helpers

const fs = require("fs");
const readline = require("readline");

function safeParseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizeEvent(e) {
  if (!e || typeof e !== "object") return null;

  const ts = typeof e.ts === "number" ? e.ts : null;
  const receivedAt = typeof e.received_at === "number" ? e.received_at : null;
  const t = ts ?? receivedAt;
  if (typeof t !== "number") return null;

  return {
    schema_version: typeof e.schema_version === "number" ? e.schema_version : null,
    app_id: typeof e.app_id === "string" ? e.app_id : "",
    // identity
    site_id: typeof e.site_id === "string" ? e.site_id : "",
    anon_user_id: typeof e.anon_user_id === "string" ? e.anon_user_id : "",
    session_id: typeof e.session_id === "string" ? e.session_id : "",

    // time
    ts: t,
    raw_ts: ts,
    received_at: receivedAt,

    // context
    event_name: typeof e.event_name === "string" ? e.event_name : "",
    url: typeof e.url === "string" ? e.url : "",
    path: typeof e.path === "string" ? e.path : "",
    referrer: typeof e.referrer === "string" ? e.referrer : null,
    user_agent: typeof e.user_agent === "string" ? e.user_agent : "",
    lang: typeof e.lang === "string" ? e.lang : null,
    screen: e.screen && typeof e.screen === "object" ? e.screen : null,
    viewport: e.viewport && typeof e.viewport === "object" ? e.viewport : null,
    ui_variant: typeof e.ui_variant === "string" ? e.ui_variant : null,

    // experiments
    experiments: Array.isArray(e.experiments) ? e.experiments.filter(Boolean) : [],

    // misc
    props: e.props && typeof e.props === "object" ? e.props : {},
    request_id: typeof e.request_id === "string" ? e.request_id : ""
  };
}

async function readEventsJsonl(filePath, opts) {
  const {
    siteId,
    fromTs,
    toTs,
    limit
  } = opts || {};

  if (!fs.existsSync(filePath)) return [];

  const out = [];
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line || !line.trim()) continue;
      const raw = safeParseJsonLine(line);
      if (!raw) continue;
      const e = normalizeEvent(raw);
      if (!e) continue;

      if (siteId && e.site_id !== siteId) continue;
      if (typeof fromTs === "number" && e.ts < fromTs) continue;
      if (typeof toTs === "number" && e.ts > toTs) continue;

      out.push(e);
      if (typeof limit === "number" && out.length >= limit) break;
    }
  } finally {
    rl.close();
    try {
      stream.close();
    } catch {}
  }

  return out;
}

function pickEvidenceEvent(e) {
  if (!e) return null;
  const props = e.props || {};
  return {
    ts: e.ts,
    event_name: e.event_name,
    path: e.path,
    props: {
      element_id: typeof props.element_id === "string" ? props.element_id : null,
      dwell_ms: typeof props.dwell_ms === "number" ? props.dwell_ms : null,
      reason: typeof props.reason === "string" ? props.reason : null,
      message: typeof props.message === "string" ? props.message : null,
      code: typeof props.code === "string" ? props.code : null
    }
  };
}

module.exports = {
  readEventsJsonl,
  normalizeEvent,
  safeParseJsonLine,
  pickEvidenceEvent
};
