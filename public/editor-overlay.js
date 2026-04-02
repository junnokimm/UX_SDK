// public/editor-overlay.js
(function () {
  "use strict";

  let pickMode = true;

  // Hover/select overlay boxes
  const hoverBox = document.createElement("div");
  const selectBox = document.createElement("div");

  // Editor applied style holder (for inject_css)
  const injectedStyle = document.createElement("style");
  injectedStyle.id = "__ve_injected_css__";
  document.documentElement.appendChild(injectedStyle);

  // Store original states for reset
  // key: selector (or internal id), value: { text, display, className, attrs: Map }
  const originalMap = new Map();

  // Style for overlay UI
  const style = document.createElement("style");
  style.textContent = `
    .__ve_box {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      border-radius: 8px;
      box-sizing: border-box;
    }
    .__ve_hover { border: 2px solid rgba(106,169,255,0.95); box-shadow: 0 0 0 2px rgba(106,169,255,0.12); }
    .__ve_select { border: 2px solid rgba(59,214,113,0.95); box-shadow: 0 0 0 2px rgba(59,214,113,0.12); }
    .__ve_badge {
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      background: rgba(23,26,33,0.92);
      color: #e9eef6;
      border: 1px solid rgba(42,47,58,0.9);
      border-radius: 10px;
      padding: 6px 8px;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      max-width: 560px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;
  document.documentElement.appendChild(style);

  hoverBox.className = "__ve_box __ve_hover";
  selectBox.className = "__ve_box __ve_select";
  document.documentElement.appendChild(hoverBox);
  document.documentElement.appendChild(selectBox);

  const badge = document.createElement("div");
  badge.className = "__ve_badge";
  document.documentElement.appendChild(badge);

  hideEl(hoverBox); hideEl(selectBox); badge.style.display = "none";

  function hideEl(el) { el.style.display = "none"; }
  function showEl(el) { el.style.display = "block"; }

  function post(type, payload) {
    try {
      window.parent.postMessage({ type, ...(payload || {}) }, window.location.origin);
    } catch { /* ignore */ }
  }

  function rectToFixedBox(el, box) {
    const r = el.getBoundingClientRect();
    box.style.left = Math.round(r.left) + "px";
    box.style.top = Math.round(r.top) + "px";
    box.style.width = Math.round(r.width) + "px";
    box.style.height = Math.round(r.height) + "px";
    return r;
  }

  // ---------- Selector Generator (MVP) ----------
  function cssEscape(v) {
    const value = String(v == null ? "" : v);
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return value
      .replace(/^[0-9]/, (match) => `\\3${match} `)
      .replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  }

  function attrEscape(v) {
    return String(v == null ? "" : v).replace(/"/g, '\\"');
  }

  function buildSelector(el) {
    if (!(el instanceof Element)) return null;

    const tid = el.getAttribute("data-track-id");
    if (tid) return `[data-track-id="${attrEscape(tid)}"]`;

    if (el.id) return `#${cssEscape(el.id)}`;

    const tag = el.tagName.toLowerCase();
    const cls = (el.className || "").toString().trim();
    if (cls) {
      const classes = cls.split(/\s+/).filter(Boolean).slice(0, 3);
      if (classes.length) return `${tag}.${classes.map(cssEscape).join(".")}`;
    }

    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.tagName && depth < 5) {
      const t = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (!parent) { parts.unshift(t); break; }

      const idx = Array.from(parent.children).indexOf(cur) + 1;
      let part = t + `:nth-child(${idx})`;
      parts.unshift(part);

      cur = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  function getElementInfo(el) {
    const selector = buildSelector(el);
    const rect = el.getBoundingClientRect();
    const text = (el.innerText || "").trim().slice(0, 120);
    return {
      selector,
      tag: el.tagName ? el.tagName.toLowerCase() : null,
      track_id: el.getAttribute("data-track-id") || null,
      text: text || null,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    };
  }

  function isBlockedTarget(el) {
    if (!el) return true;
    if (el === hoverBox || el === selectBox || el === badge) return true;
    if (el.classList?.contains("__ve_box")) return true;
    if (el.classList?.contains("__ve_badge")) return true;
    if (el === document.documentElement || el === document.body) return true;
    return false;
  }

  // ---------- Change Apply Engine ----------
  function qsaSafe(selector) {
    try { return Array.from(document.querySelectorAll(selector)); }
    catch { return []; }
  }

  function snapshotOriginal(selector, el) {
    // selector 단위로 1개 원본만 저장(실무는 node별로 키가 따로 필요할 수 있음)
    if (originalMap.has(selector)) return;

    const attrs = {};
    // 자주 건드는 속성 몇 개만 저장(확장 가능)
    ["href", "src", "aria-label", "title", "value", "placeholder"].forEach((n) => {
      if (el.hasAttribute(n)) attrs[n] = el.getAttribute(n);
    });

    originalMap.set(selector, {
      text: el.textContent,
      display: el.style.display,
      styleAttr: el.getAttribute("style"),
      className: el.className,
      attrs
    });
  }

  function resetAll(options) {
    // CSS 주입 원복
    injectedStyle.textContent = "";

    // 저장된 원본으로 돌려놓기
    for (const [selector, orig] of originalMap.entries()) {
      const els = qsaSafe(selector);
      els.forEach((el) => {
        if (!(el instanceof Element)) return;
        if (typeof orig.text === "string") el.textContent = orig.text;
        if (orig.styleAttr === null || orig.styleAttr === undefined) el.removeAttribute("style");
        else el.setAttribute("style", orig.styleAttr);
        el.style.display = orig.display || "";
        el.className = orig.className || "";

        // attrs restore
        if (orig.attrs) {
          for (const [k, v] of Object.entries(orig.attrs)) {
            if (v === null || v === undefined) el.removeAttribute(k);
            else el.setAttribute(k, v);
          }
        }
      });
    }

    // 원본맵은 유지(다시 B 적용할 때 재스냅샷 필요 없게)
    if (!options?.silent) {
      post("EDITOR_APPLY_RESULT", { ok: true, message: "reset done" });
    }
  }

  function applyOneChange(change) {
    if (!change) return { ok: false, message: "empty change" };

    // global CSS inject
    if (change.type === "inject_css") {
      injectedStyle.textContent = String(change.css || "");
      return { ok: true, message: "applied global css" };
    }

    const selector = change.selector;
    const actions = Array.isArray(change.actions) ? change.actions : [];
    const els = qsaSafe(selector);

    if (els.length === 0) {
      return { ok: false, message: `selector not found: ${selector}` };
    }

    // 원본 스냅샷(첫 요소 기준)
    snapshotOriginal(selector, els[0]);

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

    return { ok: true, message: `applied: ${selector}` };
  }

  function applyChanges(changes) {
    const list = Array.isArray(changes) ? changes : [];
    const results = list.map(applyOneChange);
    const failures = results.filter((result) => !result?.ok);
    if (failures.length > 0) {
      const first = failures[0];
      post("EDITOR_APPLY_RESULT", {
        ok: false,
        message: `${failures.length}개 실패 / ${list.length}개 변경 - ${first?.message || "apply failed"}`,
      });
      return;
    }

    post("EDITOR_APPLY_RESULT", {
      ok: true,
      message: `${list.length}개 변경 적용 완료`,
    });
  }

  // ---------- Picking handlers ----------
  let lastHoverEl = null;
  let selectedEl = null;

  function onMouseMove(e) {
    if (!pickMode) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isBlockedTarget(el)) {
      hideEl(hoverBox);
      badge.style.display = "none";
      lastHoverEl = null;
      return;
    }

    if (el !== lastHoverEl) {
      lastHoverEl = el;
      const info = getElementInfo(el);

      showEl(hoverBox);
      rectToFixedBox(el, hoverBox);

      badge.style.display = "block";
      badge.style.left = Math.min(window.innerWidth - 20, e.clientX + 12) + "px";
      badge.style.top = Math.min(window.innerHeight - 20, e.clientY + 12) + "px";
      badge.textContent = `${info.tag}  ${info.selector}`;

      post("EDITOR_ELEMENT_HOVER", info);
    } else {
      badge.style.left = Math.min(window.innerWidth - 20, e.clientX + 12) + "px";
      badge.style.top = Math.min(window.innerHeight - 20, e.clientY + 12) + "px";
    }
  }

  function onClick(e) {
    if (!pickMode) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isBlockedTarget(el)) return;

    e.preventDefault();
    e.stopPropagation();

    selectedEl = el;
    const info = getElementInfo(el);

    showEl(selectBox);
    rectToFixedBox(el, selectBox);

    post("EDITOR_ELEMENT_SELECTED", info);
  }

  function refreshBoxes() {
    if (lastHoverEl && pickMode) rectToFixedBox(lastHoverEl, hoverBox);
    if (selectedEl) rectToFixedBox(selectedEl, selectBox);
  }

  // Parent messages
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};

    if (data.type === "EDITOR_SET_PICKMODE") {
      pickMode = !!data.pickMode;
      post("EDITOR_LOG", { message: `pickMode=${pickMode}` });

      if (!pickMode) {
        hideEl(hoverBox);
        badge.style.display = "none";
      }
      return;
    }

    if (data.type === "EDITOR_PREVIEW_SET_VARIANT") {
      const v = data.variant;
      const changes = data.changes || [];
      if (v === "A") {
        resetAll();
      } else if (v === "B") {
        // 항상 “A로 리셋 후 B 적용” 방식이 예측 가능
        resetAll({ silent: true });
        applyChanges(changes);
      }
      refreshBoxes();
      return;
    }
  });

  // Listeners
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", refreshBoxes, true);
  window.addEventListener("resize", refreshBoxes, true);

  post("EDITOR_LOG", { message: "overlay ready (with preview apply engine)" });
})();
