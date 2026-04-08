(function (root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
    module.exports.default = api;
    module.exports.create = api.create;
    module.exports.createSdk = api.createSdk;
    module.exports.initUxSdk = api.initUxSdk;
    module.exports.DEFAULTS = api.DEFAULTS;
  }

  if (root && typeof root === "object") {
    root.MiniSDK = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this), function (global) {
  "use strict";

  const DEFAULTS = {
    endpoint: "/collect",
    configEndpoint: "/api/config",
    siteId: "ab-sample",
    appId: "ab-sample",
    schemaVersion: 1,
    flushIntervalMs: 3000,
    maxBatchSize: 20,
    sessionTtlMs: 30 * 60 * 1000,
    clickSelector: "[data-track-id]",
    abAssignmentMode: "sticky",
    debug: false,
    sdkBaseUrl: ""
  };

  const LS_USER = "sdk_anon_user_id_v1";
  const LS_SESSION = "sdk_session_v1";
  const LS_BUCKET_PREFIX = "sdk_bucket_";
  const LS_VARIANT = "ab_variant_v1";

  function now() { return Date.now(); }
  function randId(prefix) { return `${prefix}_${Math.random().toString(16).slice(2)}_${now().toString(16)}`; }
  function safeJsonParse(s) { try { return JSON.parse(s); } catch { return null; } }
  function getStorage() { return global.localStorage; }
  function getDocument() { return global.document; }
  function getLocation() { return global.location; }
  function getNavigator() { return global.navigator; }
  function getWindow() { return global.window || global; }
  function joinUrl(baseUrl, path) {
    const base = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!base) return path;
    if (/^https?:\/\//i.test(String(path || ""))) return String(path);
    return `${base}${String(path || "")}`;
  }

  function getAnonUserId() {
    const storage = getStorage();
    const existing = storage.getItem(LS_USER);
    if (existing && existing.length > 6) return existing;
    const id = randId("u");
    storage.setItem(LS_USER, id);
    return id;
  }

  function getOrRefreshSessionId(sessionTtlMs) {
    const storage = getStorage();
    const raw = storage.getItem(LS_SESSION);
    const obj = raw ? safeJsonParse(raw) : null;
    const t = now();

    if (obj && obj.id && typeof obj.lastActive === "number") {
      const inactive = t - obj.lastActive;
      if (inactive <= sessionTtlMs) {
        obj.lastActive = t;
        storage.setItem(LS_SESSION, JSON.stringify(obj));
        return obj.id;
      }
    }

    const s = { id: randId("s"), lastActive: t };
    storage.setItem(LS_SESSION, JSON.stringify(s));
    return s.id;
  }

  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function getBucketKey(siteId, expKey) {
    return `${LS_BUCKET_PREFIX}${siteId}_${expKey}`;
  }

  function getAbMode(config) {
    const sp = new URLSearchParams(getLocation().search);
    return sp.get("__ab_mode") || config.abAssignmentMode || "sticky";
  }

  function getAbForce() {
    const sp = new URLSearchParams(getLocation().search);
    const v = sp.get("__ab_force");
    return (v === "A" || v === "B") ? v : null;
  }

  function decideVariant(siteId, expKey, traffic, anonUserId, config) {
    const force = getAbForce();
    if (force) return force;

    const mode = getAbMode(config);
    const aPct = Math.max(0, Math.min(100, Number(traffic?.A ?? 50)));
    if (mode === "per_load") {
      const bucket = Math.floor(Math.random() * 100);
      return bucket < aPct ? "A" : "B";
    }

    const storage = getStorage();
    const k = getBucketKey(siteId, expKey);
    const existing = storage.getItem(k);
    if (existing === "A" || existing === "B") return existing;

    const seed = `${siteId}|${expKey}|${anonUserId}`;
    const bucket = fnv1a32(seed) % 100;
    const v = bucket < aPct ? "A" : "B";
    storage.setItem(k, v);
    return v;
  }

  function includesToken(source, tokens) {
    return tokens.some((token) => source.includes(token));
  }

  function inferSemanticEvents(elementInfo) {
    const elementId = String(elementInfo?.element_id || "").trim().toLowerCase();
    if (!elementId) return [];

    const names = [];
    if (includesToken(elementId, ["add_to_cart", "cart_add"])) names.push("add_to_cart");
    if (includesToken(elementId, ["remove_from_cart", "cart_remove"])) names.push("remove_from_cart");
    if (includesToken(elementId, ["checkout_start", "start_checkout", "begin_checkout", "cart_checkout"])) names.push("checkout_start");
    if (elementId === "pay" || includesToken(elementId, ["pay_btn", "payment"])) names.push("payment_attempt");
    if (includesToken(elementId, ["search"])) names.push("search");
    if (includesToken(elementId, ["filter", "sort"])) names.push("filter_change");
    return Array.from(new Set(names));
  }

  function qsaSafe(selector) {
    try { return Array.from(getDocument().querySelectorAll(selector)); } catch { return []; }
  }

  function applyOneChange(change, injectedStyleEl) {
    if (!change) return;
    if (change.type === "inject_css") {
      injectedStyleEl.textContent += "\n" + String(change.css || "");
      return;
    }

    const selector = change.selector;
    const actions = Array.isArray(change.actions) ? change.actions : [];
    const els = qsaSafe(selector);
    if (els.length === 0) return;

    els.forEach((el) => {
      actions.forEach((a) => {
        const t = a.type;
        if (t === "hide") el.style.display = "none";
        else if (t === "show") el.style.display = "";
        else if (t === "set_text") el.textContent = String(a.value ?? "");
        else if (t === "set_style") {
          const styles = a.styles && typeof a.styles === "object" ? a.styles : null;
          if (!styles) return;
          Object.entries(styles).forEach(([name, value]) => {
            const prop = String(name || "").trim();
            if (!prop) return;
            if (value === null || value === undefined || String(value).trim() === "") {
              el.style.removeProperty(prop);
            } else {
              el.style.setProperty(prop, String(value));
            }
          });
        }
        else if (t === "add_class") el.classList.add(String(a.value ?? ""));
        else if (t === "remove_class") el.classList.remove(String(a.value ?? ""));
        else if (t === "set_attr") {
          const name = String(a.name ?? "").trim();
          if (!name) return;
          const val = a.value;
          if (val === null || val === undefined) el.removeAttribute(name);
          else el.setAttribute(name, String(val));
        }
      });
    });
  }

  function applyChangesWithRetry(changes, debugLog) {
    const list = Array.isArray(changes) ? changes : [];
    if (list.length === 0) return;

    const doc = getDocument();
    let styleEl = doc.getElementById("__sdk_injected_css__");
    if (!styleEl) {
      styleEl = doc.createElement("style");
      styleEl.id = "__sdk_injected_css__";
      doc.documentElement.appendChild(styleEl);
    }
    styleEl.textContent = "";

    list.forEach((c) => applyOneChange(c, styleEl));

    let tries = 0;
    const maxTries = 20;
    const obs = new MutationObserver(() => {
      tries++;
      list.forEach((c) => applyOneChange(c, styleEl));
      if (tries >= maxTries) {
        obs.disconnect();
        debugLog && debugLog(`apply retry stop (tries=${tries})`);
      }
    });

    obs.observe(doc.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { obs.disconnect(); } catch {} }, 5000);
  }

  function createSdk(userConfig) {
    const config = { ...DEFAULTS, ...(userConfig || {}) };
    config.endpoint = joinUrl(config.sdkBaseUrl, config.endpoint);
    config.configEndpoint = joinUrl(config.sdkBaseUrl, config.configEndpoint);

    let queue = [];
    let flushTimer = null;
    let pageStartTs = now();
    let assignedExperiments = [];

    function log(...args) {
      if (config.debug) console.log("[SDK]", ...args);
    }

    function getBaseContext() {
      const doc = getDocument();
      const loc = getLocation();
      const nav = getNavigator();
      const win = getWindow();
      return {
        schema_version: config.schemaVersion,
        app_id: config.appId,
        site_id: config.siteId,
        ts: now(),
        url: loc.href,
        path: loc.pathname,
        referrer: doc.referrer || null,
        user_agent: nav.userAgent,
        lang: nav.language,
        screen: { w: win.screen?.width, h: win.screen?.height },
        viewport: { w: win.innerWidth, h: win.innerHeight },
        anon_user_id: getAnonUserId(),
        session_id: getOrRefreshSessionId(config.sessionTtlMs),
        ui_variant: (getStorage().getItem(LS_VARIANT) || "U"),
        experiments: assignedExperiments
      };
    }

    function enqueue(eventName, props) {
      const ctx = getBaseContext();
      queue.push({ event_name: eventName, ...ctx, props: props || {} });
      if (queue.length >= config.maxBatchSize) flush();
    }

    function sendPayload(payload) {
      const nav = getNavigator();
      const body = JSON.stringify(payload);

      if (nav.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const ok = nav.sendBeacon(config.endpoint, blob);
        log("sendBeacon", ok, payload.events?.length);
        return ok;
      }

      fetch(config.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true
      }).catch((e) => log("fetch error", e));
      return true;
    }

    function flush() {
      if (queue.length === 0) return;
      const events = queue.splice(0, config.maxBatchSize);
      sendPayload({ events });
    }

    function startAutoFlush() {
      if (flushTimer) clearInterval(flushTimer);
      flushTimer = setInterval(flush, config.flushIntervalMs);
    }

    function trackPageView(extraProps) {
      enqueue("page_view", { title: getDocument().title, ...(extraProps || {}) });
    }

    function pickElementInfo(el) {
      if (!el) return null;
      const rect = el.getBoundingClientRect?.();
      return {
        element_id: el.getAttribute("data-track-id") || null,
        tag: el.tagName?.toLowerCase?.() || null,
        text: (el.innerText || "").trim().slice(0, 80) || null,
        aria_label: el.getAttribute("aria-label") || null,
        id: el.id || null,
        class: (el.className || "").toString().slice(0, 120) || null,
        rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null
      };
    }

    function trackClick(e) {
      const target = e.target?.closest?.(config.clickSelector);
      if (!target) return;
      getOrRefreshSessionId(config.sessionTtlMs);
      const elementInfo = pickElementInfo(target);
      const baseProps = {
        ...elementInfo,
        x: typeof e.clientX === "number" ? Math.round(e.clientX) : null,
        y: typeof e.clientY === "number" ? Math.round(e.clientY) : null
      };
      enqueue("click", baseProps);
      inferSemanticEvents(elementInfo).forEach((eventName) => {
        enqueue(eventName, { ...baseProps, source_event: "click" });
      });
    }

    function trackDwell(reason) {
      const dwellMs = Math.max(0, now() - pageStartTs);
      enqueue("dwell_time", { dwell_ms: dwellMs, reason: reason || "unknown", title: getDocument().title });
      flush();
    }

    async function fetchAndApplyConfig() {
      const anon = getAnonUserId();
      const loc = getLocation();
      const url = encodeURIComponent(loc.href);
      const ep = `${config.configEndpoint}?site_id=${encodeURIComponent(config.siteId)}&url=${url}`;

      try {
        const r = await fetch(ep, { method: "GET", headers: { accept: "application/json" } });
        const j = await r.json();
        if (!j?.ok) return;

        const exps = Array.isArray(j.experiments) ? j.experiments : [];
        assignedExperiments = exps.map((exp) => {
          const v = decideVariant(config.siteId, exp.key, exp.traffic, anon, config);
          return { key: exp.key, variant: v, version: exp.version };
        });

        exps.forEach((exp) => {
          const assigned = assignedExperiments.find((x) => x.key === exp.key);
          const v = assigned?.variant || "A";
          const changes = v === "B" ? (exp.variants?.B || []) : [];
          if (changes && changes.length) {
            log("apply exp", exp.key, "variant", v, "changes", changes.length);
            applyChangesWithRetry(changes, (m) => log(m));
          }
        });

        enqueue("ab_config_applied", { experiments: assignedExperiments, pathname: j.pathname });
        flush();
      } catch (e) {
        log("config fetch error", e);
      }

      try {
        getDocument().documentElement.setAttribute("data-ab", assignedExperiments.map((x) => `${x.key}:${x.variant}`).join(","));
      } catch {}
    }

    function install() {
      pageStartTs = now();
      fetchAndApplyConfig().finally(() => {
        trackPageView({ reason: "load" });
      });
      getDocument().addEventListener("click", trackClick, { capture: true });
      getDocument().addEventListener("visibilitychange", () => {
        if (getDocument().visibilityState === "hidden") trackDwell("hidden");
      });
      getWindow().addEventListener("pagehide", () => trackDwell("pagehide"));
      getWindow().addEventListener("beforeunload", () => trackDwell("beforeunload"));
      startAutoFlush();
      log("installed");
    }

    return { install, flush, track: enqueue, trackPageView };
  }

  function initUxSdk(userConfig) {
    const sdk = createSdk(userConfig);
    sdk.install();
    return sdk;
  }

  return {
    DEFAULTS,
    create: createSdk,
    createSdk,
    initUxSdk,
  };
});
