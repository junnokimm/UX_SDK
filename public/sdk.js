// public/sdk.js
(function (global) {
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
    debug: false
  };

  const LS_USER = "sdk_anon_user_id_v1";
  const LS_SESSION = "sdk_session_v1"; // {id, lastActive}
  const LS_BUCKET_PREFIX = "sdk_bucket_"; // sdk_bucket_<siteId>_<expKey> = "A"|"B"
  const LS_VARIANT = "ab_variant_v1"; // (기존 샘플용) 있으면 참고만

  function now() { return Date.now(); }
  function randId(prefix) { return `${prefix}_${Math.random().toString(16).slice(2)}_${now().toString(16)}`; }
  function safeJsonParse(s) { try { return JSON.parse(s); } catch { return null; } }

  function getAnonUserId() {
    const existing = localStorage.getItem(LS_USER);
    if (existing && existing.length > 6) return existing;
    const id = randId("u");
    localStorage.setItem(LS_USER, id);
    return id;
  }

  function getOrRefreshSessionId(sessionTtlMs) {
    const raw = localStorage.getItem(LS_SESSION);
    const obj = raw ? safeJsonParse(raw) : null;
    const t = now();

    if (obj && obj.id && typeof obj.lastActive === "number") {
      const inactive = t - obj.lastActive;
      if (inactive <= sessionTtlMs) {
        obj.lastActive = t;
        localStorage.setItem(LS_SESSION, JSON.stringify(obj));
        return obj.id;
      }
    }

    const s = { id: randId("s"), lastActive: t };
    localStorage.setItem(LS_SESSION, JSON.stringify(s));
    return s.id;
  }

  // --------- A/B bucket ----------
  function fnv1a32(str) {
    // simple stable hash
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

  // ✅ 추가: query로 강제/모드 제어
function getAbMode() {
  const sp = new URLSearchParams(location.search);
  // __ab_mode=per_load  -> 새로고침마다 랜덤
  // __ab_mode=sticky    -> 기존처럼 고정
  return sp.get("__ab_mode") || "per_load"; // ✅ 기본을 per_load로!
}

function getAbForce() {
  const sp = new URLSearchParams(location.search);
  // __ab_force=A 또는 __ab_force=B
  const v = sp.get("__ab_force");
  return (v === "A" || v === "B") ? v : null;
}

// ✅ 교체: 기존 decideVariant()를 아래로 바꿔
function decideVariant(siteId, expKey, traffic, anonUserId) {
  const force = getAbForce();
  if (force) return force;

  const mode = getAbMode();
  const aPct = Math.max(0, Math.min(100, Number(traffic?.A ?? 50)));

  // ✅ per_load: 매 로드마다 랜덤
  if (mode === "per_load") {
    const bucket = Math.floor(Math.random() * 100);
    return bucket < aPct ? "A" : "B";
  }

  // ✅ sticky: (원하면 유지) 기존처럼 유저 고정
  const k = getBucketKey(siteId, expKey);
  const existing = localStorage.getItem(k);
  if (existing === "A" || existing === "B") return existing;

  const seed = `${siteId}|${expKey}|${anonUserId}`;
  const bucket = fnv1a32(seed) % 100;

  const v = bucket < aPct ? "A" : "B";
  localStorage.setItem(k, v);
  return v;
}

  // --------- Change apply engine ----------
  function qsaSafe(selector) {
    try { return Array.from(document.querySelectorAll(selector)); } catch { return []; }
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

    // CSS injection style holder
    let styleEl = document.getElementById("__sdk_injected_css__");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "__sdk_injected_css__";
      document.documentElement.appendChild(styleEl);
    }
    styleEl.textContent = ""; // reapply fresh

    // 1차 적용
    list.forEach((c) => applyOneChange(c, styleEl));

    // SPA/late DOM 대응: MutationObserver로 몇 번 더 재시도
    let tries = 0;
    const maxTries = 20; // 과도 방지
    const obs = new MutationObserver(() => {
      tries++;
      list.forEach((c) => applyOneChange(c, styleEl));
      if (tries >= maxTries) {
        obs.disconnect();
        debugLog && debugLog(`apply retry stop (tries=${tries})`);
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { try { obs.disconnect(); } catch {} }, 5000); // 5초 후 정리
  }

  // --------- SDK ----------
  function createSdk(userConfig) {
    const config = { ...DEFAULTS, ...(userConfig || {}) };

    let queue = [];
    let flushTimer = null;
    let pageStartTs = now();
    let assignedExperiments = []; // [{key, variant, version}]

    function log(...args) {
      if (config.debug) console.log("[SDK]", ...args);
    }

    function getBaseContext() {
      return {
        schema_version: config.schemaVersion,
        app_id: config.appId,
        site_id: config.siteId,
        ts: now(),
        url: location.href,
        path: location.pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        lang: navigator.language,
        screen: { w: window.screen?.width, h: window.screen?.height },
        viewport: { w: window.innerWidth, h: window.innerHeight },
        anon_user_id: getAnonUserId(),
        session_id: getOrRefreshSessionId(config.sessionTtlMs),
        // legacy: 샘플에서 쓰던 variant가 있으면 참고(없어도 됨)
        ui_variant: (localStorage.getItem(LS_VARIANT) || "U"),
        experiments: assignedExperiments
      };
    }

    function enqueue(eventName, props) {
      const ctx = getBaseContext();
      queue.push({ event_name: eventName, ...ctx, props: props || {} });
      if (queue.length >= config.maxBatchSize) flush();
    }

    function sendPayload(payload) {
      const body = JSON.stringify(payload);

      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const ok = navigator.sendBeacon(config.endpoint, blob);
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
      enqueue("page_view", { title: document.title, ...(extraProps || {}) });
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
        rect: rect ? {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height)
        } : null
      };
    }

    function trackClick(e) {
      const target = e.target?.closest?.(config.clickSelector);
      if (!target) return;

      getOrRefreshSessionId(config.sessionTtlMs);

      enqueue("click", {
        ...pickElementInfo(target),
        x: typeof e.clientX === "number" ? Math.round(e.clientX) : null,
        y: typeof e.clientY === "number" ? Math.round(e.clientY) : null
      });
    }

    function trackDwell(reason) {
      const dwellMs = Math.max(0, now() - pageStartTs);
      enqueue("dwell_time", { dwell_ms: dwellMs, reason: reason || "unknown", title: document.title });
      flush();
    }

    async function fetchAndApplyConfig() {
      const anon = getAnonUserId();
      const url = encodeURIComponent(location.href);
      const ep = `${config.configEndpoint}?site_id=${encodeURIComponent(config.siteId)}&url=${url}`;

      try {
        const r = await fetch(ep, { method: "GET", headers: { "accept": "application/json" } });
        const j = await r.json();
        if (!j?.ok) return;

        const exps = Array.isArray(j.experiments) ? j.experiments : [];

        assignedExperiments = exps.map((exp) => {
          const v = decideVariant(config.siteId, exp.key, exp.traffic, anon);
          return { key: exp.key, variant: v, version: exp.version };
        });

        // Apply B changes only (A는 원본)
        exps.forEach((exp) => {
          const assigned = assignedExperiments.find((x) => x.key === exp.key);
          const v = assigned?.variant || "A";
          const changes = v === "B" ? (exp.variants?.B || []) : [];
          if (changes && changes.length) {
            log("apply exp", exp.key, "variant", v, "changes", changes.length);
            applyChangesWithRetry(changes, (m) => log(m));
          }
        });

        // config 적용 이벤트(디버깅/대시보드용)
        enqueue("ab_config_applied", { experiments: assignedExperiments, pathname: j.pathname });
        flush();
      } catch (e) {
        log("config fetch error", e);
      }
      try {
  document.documentElement.setAttribute(
    "data-ab",
    assignedExperiments.map(x => `${x.key}:${x.variant}`).join(",")
  );
  console.log("[AB]", document.documentElement.getAttribute("data-ab"));
} catch {}
    }

    function install() {
      pageStartTs = now();

      // 1) config 먼저 받아서 적용 (가능하면 page_view 전에)
      fetchAndApplyConfig().finally(() => {
        trackPageView({ reason: "load" });
      });

      document.addEventListener("click", trackClick, { capture: true });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") trackDwell("hidden");
      });
      window.addEventListener("pagehide", () => trackDwell("pagehide"));
      window.addEventListener("beforeunload", () => trackDwell("beforeunload"));

      startAutoFlush();
      log("installed");
    }

    return { install, flush, track: enqueue, trackPageView };
  }

  global.MiniSDK = { create: createSdk };
})(window);
