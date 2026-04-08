// analytics/sessionSummary.js

const { inferStepFromEvent, maxStep } = require("./funnel");
const { pickEvidenceEvent } = require("./events");

function isClick(e) {
  return e && e.event_name === "click";
}

function isPageView(e) {
  return e && e.event_name === "page_view";
}

function isErrorEvent(e) {
  if (!e) return false;
  if (e.event_name === "error") return true;
  const props = e.props || {};
  return typeof props.message === "string" || typeof props.code === "string";
}

function isPriceInteraction(e) {
  if (!isClick(e)) return false;
  const props = e.props || {};
  const elid = String(props.element_id || "").toLowerCase();
  return (
    elid.includes("price") ||
    elid.includes("coupon") ||
    elid.includes("discount") ||
    elid.includes("shipping") ||
    elid.includes("fee")
  );
}

function isFilterInteraction(e) {
  if (!e) return false;
  if (e.event_name === "filter_change") return true;
  if (!isClick(e)) return false;
  const elid = String(e.props?.element_id || "").toLowerCase();
  return elid.includes("filter") || elid.includes("sort");
}

function isSearchInteraction(e) {
  if (!e) return false;
  if (e.event_name === "search") return true;
  if (!isClick(e)) return false;
  const elid = String(e.props?.element_id || "").toLowerCase();
  return elid.includes("search");
}

function isPaymentAttempt(e) {
  if (!e) return false;
  if (e.event_name === "payment_attempt") return true;
  if (!isClick(e)) return false;
  const elid = String(e.props?.element_id || "").toLowerCase();
  return elid.includes("pay_btn") || elid === "pay";
}

function isCartAdd(e) {
  if (e?.event_name === "add_to_cart") return true;
  if (!isClick(e)) return false;
  const elid = String(e.props?.element_id || "").toLowerCase();
  return elid.includes("add_to_cart") || elid.includes("cart_add");
}

function isCartRemove(e) {
  if (e?.event_name === "remove_from_cart") return true;
  if (!isClick(e)) return false;
  const elid = String(e.props?.element_id || "").toLowerCase();
  return elid.includes("remove_from_cart") || elid.includes("cart_remove");
}

function detectRageClicks(events) {
  // rage click: same element_id clicked >= 3 times within 2 seconds
  const rage = [];
  const clicks = (events || []).filter(isClick);
  for (let i = 0; i < clicks.length; i++) {
    const base = clicks[i];
    const elid = String(base.props?.element_id || "");
    if (!elid) continue;

    let count = 1;
    const start = base.ts;
    for (let j = i + 1; j < clicks.length; j++) {
      const c = clicks[j];
      if ((c.ts - start) > 2000) break;
      if (String(c.props?.element_id || "") === elid) count++;
    }

    if (count >= 3) rage.push({ element_id: elid, ts: start, count });
  }

  // de-dupe by element_id+ts
  const seen = new Set();
  const out = [];
  for (const r of rage) {
    const k = `${r.element_id}|${r.ts}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function summarizeSession(session, opts) {
  const { evidenceLimit = 12 } = opts || {};
  const events = Array.isArray(session?.events) ? session.events : [];
  if (events.length === 0) return null;

  const start_ts = events[0].ts;
  const end_ts = events[events.length - 1].ts;
  const duration_ms = Math.max(0, end_ts - start_ts);

  const paths = new Set();
  let page_views = 0;
  let clicks = 0;
  let dwell_total_ms = 0;
  let error_count = 0;
  let price_interaction_count = 0;
  let filter_count = 0;
  let search_count = 0;
  let cart_add_count = 0;
  let cart_remove_count = 0;
  let payment_attempt_count = 0;
  let checkout_complete = false;
  let checkout_entered = false;

  const steps = [];

  for (const e of events) {
    if (e.path) paths.add(e.path);
    if (isPageView(e)) page_views++;
    if (isClick(e)) clicks++;

    if (e.event_name === "dwell_time") {
      const ms = e.props?.dwell_ms;
      if (typeof ms === "number" && isFinite(ms)) dwell_total_ms += Math.max(0, ms);
    }

    if (isErrorEvent(e)) error_count++;
    if (isPriceInteraction(e)) price_interaction_count++;
    if (isFilterInteraction(e)) filter_count++;
    if (isSearchInteraction(e)) search_count++;
    if (isCartAdd(e)) cart_add_count++;
    if (isCartRemove(e)) cart_remove_count++;
    if (isPaymentAttempt(e)) payment_attempt_count++;

    if (e.event_name === "checkout_complete") checkout_complete = true;
    if (e.event_name === "checkout_start") checkout_entered = true;

    const step = inferStepFromEvent(e);
    steps.push(step);
    if (step === "checkout" || step === "payment") checkout_entered = true;
  }

  const rageClicks = detectRageClicks(events);
  const rage_clicks_count = rageClicks.length;

  // back_count approximation: A->B->A transitions
  let back_count = 0;
  let lastPath = null;
  let prevPath = null;
  for (const e of events) {
    const p = e.path || null;
    if (!p) continue;
    if (prevPath && lastPath && p === prevPath && p !== lastPath) back_count++;
    prevPath = lastPath;
    lastPath = p;
  }

  const depth = paths.size;
  const max_step = maxStep(steps);

  // evidence sampling: include first/last PV, errors, rage clicks, checkout-related
  const evidence = [];
  const pushEv = (ev) => {
    const p = pickEvidenceEvent(ev);
    if (!p) return;
    evidence.push(p);
  };

  pushEv(events.find(isPageView));
  pushEv(events[events.length - 1]);

  for (const e of events) {
    if (evidence.length >= evidenceLimit) break;
    if (isErrorEvent(e) || e.event_name === "checkout_complete") pushEv(e);
  }

  for (const r of rageClicks) {
    if (evidence.length >= evidenceLimit) break;
    evidence.push({ ts: r.ts, event_name: "rage_click", path: null, props: { element_id: r.element_id, count: r.count } });
  }

  return {
    site_id: events[0].site_id,
    anon_user_id: session.anon_user_id,
    session_id: session.session_id,
    start_ts,
    end_ts,
    duration_ms,

    event_count: events.length,
    page_views,
    clicks,
    depth,
    unique_paths: Array.from(paths),
    dwell_total_ms,
    back_count,

    error_count,
    rage_clicks_count,
    price_interaction_count,
    filter_count,
    search_count,
    cart_add_count,
    cart_remove_count,
    payment_attempt_count,

    checkout_entered,
    checkout_complete,
    max_step,

    evidence
  };
}

module.exports = {
  summarizeSession
};
