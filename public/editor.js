// public/editor.js
(function () {
  const frame = document.getElementById("previewFrame");
  const targetSelect = document.getElementById("targetSelect");
  const reloadBtn = document.getElementById("reloadBtn");
  const openDashboardLink = document.getElementById("openDashboardLink");
  const togglePickBtn = document.getElementById("togglePickBtn");

  const variantABtn = document.getElementById("variantABtn");
  const variantBBtn = document.getElementById("variantBBtn");

  const expKeyInput = document.getElementById("expKey");
  const urlPrefixInput = document.getElementById("urlPrefix");

  const elementNameText = document.getElementById("elementNameText");
  const statusText = document.getElementById("statusText");
  const selectorText = document.getElementById("selectorText");
  const tagText = document.getElementById("tagText");
  const trackIdText = document.getElementById("trackIdText");
  const textText = document.getElementById("textText");
  const rectText = document.getElementById("rectText");
  const logBox = document.getElementById("logBox");

  const actionType = document.getElementById("actionType");
  const intentButtons = Array.from(document.querySelectorAll(".intentBtn"));
  const textPanel = document.getElementById("textPanel");
  const stylePanel = document.getElementById("stylePanel");
  const visibilityPanel = document.getElementById("visibilityPanel");
  const linkPanel = document.getElementById("linkPanel");
  const advancedEditorBox = document.getElementById("advancedEditorBox");
  const valueRow = document.getElementById("valueRow");
  const valueLabel = valueRow.querySelector(".formLabel");
  const actionValue = document.getElementById("actionValue");

  const attrRow = document.getElementById("attrRow");
  const attrName = document.getElementById("attrName");
  const attrValue = document.getElementById("attrValue");

  const cssRow = document.getElementById("cssRow");
  const cssValue = document.getElementById("cssValue");
  const styleRow = document.getElementById("styleRow");
  const styleValue = document.getElementById("styleValue");
  const styleWidth = document.getElementById("styleWidth");
  const styleHeight = document.getElementById("styleHeight");
  const styleFontSize = document.getElementById("styleFontSize");
  const styleFontWeight = document.getElementById("styleFontWeight");
  const styleRadius = document.getElementById("styleRadius");
  const styleTextAlign = document.getElementById("styleTextAlign");
  const enableTextColor = document.getElementById("enableTextColor");
  const styleTextColor = document.getElementById("styleTextColor");
  const enableBackgroundColor = document.getElementById("enableBackgroundColor");
  const styleBackgroundColor = document.getElementById("styleBackgroundColor");
  const stylePaddingX = document.getElementById("stylePaddingX");
  const stylePaddingY = document.getElementById("stylePaddingY");
  const styleMoveX = document.getElementById("styleMoveX");
  const styleMoveY = document.getElementById("styleMoveY");
  const visibilityInputs = Array.from(document.querySelectorAll('input[name="visibilityMode"]'));
  const linkHrefValue = document.getElementById("linkHrefValue");
  const linkLabelValue = document.getElementById("linkLabelValue");

  const addChangeBtn = document.getElementById("addChangeBtn");
  const applyNowBtn = document.getElementById("applyNowBtn");
  const realApplyBtn = document.getElementById("realApplyBtn");
  const openRealBtn = document.getElementById("openRealBtn");
  const clearChangesBtn = document.getElementById("clearChangesBtn");

  const changesList = document.getElementById("changesList");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const copyJsonBtn = document.getElementById("copyJsonBtn");
  const jsonBox = document.getElementById("jsonBox");
  const editorCopilotExpKey = document.getElementById("editorCopilotExpKey");
  const editorImportedState = document.getElementById("editorImportedState");
  const applyImportedDraftBtn = document.getElementById("applyImportedDraftBtn");
  const editorCopilotRoot = document.getElementById("editorCopilotRoot");
  const editorCopilotToggleBtn = document.getElementById("editorCopilotToggleBtn");

  const DRAFT_STORAGE_KEY = "uxsdk.analyticsCopilotDraft";
  const DASHBOARD_SITE_STORAGE_KEY = "uxsdk.dashboard.siteId";
  const DEFAULT_SITE_ID = "legend-ecommerce";

  function resolveSiteId() {
    const params = new URLSearchParams(location.search);
    const querySiteId = (params.get("site_id") || "").trim();
    const storedSiteId = (localStorage.getItem(DASHBOARD_SITE_STORAGE_KEY) || "").trim();
    return querySiteId || storedSiteId || DEFAULT_SITE_ID;
  }

  const currentSiteId = resolveSiteId();
  localStorage.setItem(DASHBOARD_SITE_STORAGE_KEY, currentSiteId);

  function getDashboardUrl() {
    const url = new URL("/dashboard", location.origin);
    url.searchParams.set("site_id", currentSiteId);
    return `${url.pathname}${url.search}`;
  }

  if (openDashboardLink) {
    openDashboardLink.href = getDashboardUrl();
  }

  let pickMode = true;
  let currentVariant = "A";
  let currentComposerMode = "text";
  let currentSiteConfig = null;
  let currentTarget = null;
  let lastSelected = null;
  let changesB = [];
  let latestImportedDraft = null;
  let copilot = null;

  function log(msg) {
    const t = new Date().toLocaleTimeString();
    logBox.textContent = `[${t}] ${msg}\n` + logBox.textContent;
  }

  function postToFrame(type, payload) {
    try {
      frame.contentWindow.postMessage({ type, ...(payload || {}) }, location.origin);
      return true;
    } catch (e) {
      log(`postMessage 실패: ${String(e)}`);
      return false;
    }
  }

  function setPickMode(on) {
    pickMode = on;
    togglePickBtn.dataset.state = on ? "on" : "off";
    togglePickBtn.textContent = `선택모드: ${on ? "ON" : "OFF"}`;
    togglePickBtn.classList.toggle("primary", on);
    postToFrame("EDITOR_SET_PICKMODE", { pickMode: on });
    log(`pickMode -> ${on}`);
  }

  function setVariant(v) {
    currentVariant = v;
    variantABtn.classList.toggle("active", v === "A");
    variantBBtn.classList.toggle("active", v === "B");

    if (v === "A") {
      postToFrame("EDITOR_PREVIEW_SET_VARIANT", { variant: "A", changes: [] });
      log("preview -> Variant A (reset)");
    } else {
      postToFrame("EDITOR_PREVIEW_SET_VARIANT", { variant: "B", changes: changesB });
      log(`preview -> Variant B (apply ${changesB.length} changes)`);
    }
  }

  // iframe 로드마다 overlay 주입
  function injectOverlay() {
    statusText.textContent = "iframe 로드됨. 오버레이 주입 중…";
    try {
      const doc = frame.contentDocument;
      if (!doc) throw new Error("iframe contentDocument 접근 불가");

      if (doc.getElementById("__visual_editor_overlay__")) {
        statusText.textContent = "오버레이 이미 활성화됨";
        setPickMode(pickMode);
        setVariant(currentVariant);
        return;
      }

      const script = doc.createElement("script");
      script.id = "__visual_editor_overlay__";
      script.src = "/editor-overlay.js";
      script.async = false;

      script.onload = () => {
        statusText.textContent = "오버레이 활성화됨";
        log("overlay injected");
        setPickMode(pickMode);
        setVariant(currentVariant);
      };

      script.onerror = () => {
        statusText.textContent = "오버레이 주입 실패 (CSP/권한 확인)";
        log("overlay inject failed");
      };

      doc.documentElement.appendChild(script);
    } catch (e) {
      statusText.textContent = "오버레이 주입 실패(동일 origin인지 확인)";
      log(`inject error: ${String(e)}`);
    }
  }

  function renderSelected(info) {
    elementNameText.textContent = getFriendlyElementName(info);
    selectorText.textContent = info?.selector || "—";
    tagText.textContent = info?.tag || "—";
    trackIdText.textContent = info?.track_id || "—";
    textText.textContent = info?.text || "—";
    rectText.textContent = info?.rect
      ? `x:${info.rect.x} y:${info.rect.y} w:${info.rect.w} h:${info.rect.h}`
      : "—";
  }

  function prettifyToken(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncateText(value, max) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function getFriendlyElementName(info) {
    const tag = String(info?.tag || "").toLowerCase();
    const tagLabelMap = {
      button: "버튼",
      a: "링크",
      img: "이미지",
      input: "입력창",
      textarea: "입력 영역",
      h1: "제목",
      h2: "제목",
      h3: "제목",
      p: "문단",
      span: "텍스트",
      div: "영역"
    };
    const tagLabel = tagLabelMap[tag] || (tag ? `${tag} 요소` : "요소");
    const readableTrack = prettifyToken(info?.track_id);
    const readableText = truncateText(info?.text, 26);

    if (readableText && (tag === "button" || tag === "a")) {
      return `"${readableText}" ${tagLabel}`;
    }
    if (readableText) {
      return `"${readableText}" ${tagLabel}`;
    }
    if (readableTrack) {
      return `${readableTrack} ${tagLabel}`;
    }
    return `선택한 ${tagLabel}`;
  }

  function parseOptionalNumber(inputEl) {
    const raw = String(inputEl?.value || "").trim();
    if (raw === "") return { ok: true, value: null };
    const num = Number(raw);
    if (!Number.isFinite(num)) return { ok: false, reason: `숫자를 확인하세요: ${raw}` };
    return { ok: true, value: num };
  }

  function buildStyleObjectFromControls() {
    const styles = {};
    const pxFields = [
      [styleWidth, "width"],
      [styleHeight, "height"],
      [styleFontSize, "font-size"],
      [styleRadius, "border-radius"]
    ];

    for (const [inputEl, prop] of pxFields) {
      const parsed = parseOptionalNumber(inputEl);
      if (!parsed.ok) return parsed;
      if (parsed.value !== null) styles[prop] = `${parsed.value}px`;
    }

    const paddingX = parseOptionalNumber(stylePaddingX);
    if (!paddingX.ok) return paddingX;
    if (paddingX.value !== null) {
      styles["padding-left"] = `${paddingX.value}px`;
      styles["padding-right"] = `${paddingX.value}px`;
    }

    const paddingY = parseOptionalNumber(stylePaddingY);
    if (!paddingY.ok) return paddingY;
    if (paddingY.value !== null) {
      styles["padding-top"] = `${paddingY.value}px`;
      styles["padding-bottom"] = `${paddingY.value}px`;
    }

    const moveX = parseOptionalNumber(styleMoveX);
    if (!moveX.ok) return moveX;
    const moveY = parseOptionalNumber(styleMoveY);
    if (!moveY.ok) return moveY;
    if (moveX.value !== null || moveY.value !== null) {
      styles.transform = `translate(${moveX.value ?? 0}px, ${moveY.value ?? 0}px)`;
    }

    if (styleFontWeight.value) styles["font-weight"] = styleFontWeight.value;
    if (styleTextAlign.value) styles["text-align"] = styleTextAlign.value;
    if (enableTextColor.checked) styles.color = styleTextColor.value;
    if (enableBackgroundColor.checked) styles["background-color"] = styleBackgroundColor.value;

    if (Object.keys(styles).length === 0) {
      return { ok: false, reason: "먼저 바꾸고 싶은 스타일 값을 하나 이상 입력하세요." };
    }

    return { ok: true, styles };
  }

  function getVisibilityMode() {
    const checked = visibilityInputs.find((input) => input.checked);
    return checked?.value === "hide" ? "hide" : "show";
  }

  function getStyleSummary(styles) {
    const labels = {
      width: "가로",
      height: "세로",
      "font-size": "글자 크기",
      "font-weight": "글자 굵기",
      "border-radius": "둥근 정도",
      color: "글자 색",
      "background-color": "배경 색",
      "padding-left": "안쪽 여백",
      transform: "위치 이동",
      "text-align": "정렬"
    };
    const names = [];
    for (const key of Object.keys(styles || {})) {
      const label = labels[key];
      if (label && !names.includes(label)) names.push(label);
      if (names.length >= 3) break;
    }
    return names.length ? names.join(", ") : "스타일 조정";
  }

  function buildFriendlyDetail(change) {
    if (change.type === "inject_css") {
      return "고급 CSS 규칙이 추가돼요.";
    }
    const action = Array.isArray(change.actions) ? change.actions[0] : null;
    if (!action) return "변경 상세 정보 없음";

    if (action.type === "set_text") return `새 문구: ${String(action.value || "")}`;
    if (action.type === "set_style") return `조정 항목: ${getStyleSummary(action.styles || {})}`;
    if (action.type === "hide") return "선택한 요소를 숨겨요.";
    if (action.type === "show") return "선택한 요소를 다시 보여줘요.";
    if (action.type === "set_attr" && action.name === "href") return `이동 주소: ${String(action.value || "")}`;
    if (action.type === "set_attr") return `속성 변경: ${action.name}`;
    if (action.type === "add_class") return `클래스 추가: ${String(action.value || "")}`;
    if (action.type === "remove_class") return `클래스 제거: ${String(action.value || "")}`;
    return action.type;
  }

  function buildChangeLabel(change) {
    if (change.type === "inject_css") return change.label || "고급 CSS 규칙 적용";

    const name = change.element_name || getFriendlyElementName(lastSelected);
    const action = Array.isArray(change.actions) ? change.actions[0] : null;
    if (!action) return name;

    if (action.type === "set_text") return `${name} 문구 변경`;
    if (action.type === "set_style") return `${name} 스타일 조정`;
    if (action.type === "hide") return `${name} 숨기기`;
    if (action.type === "show") return `${name} 다시 보이기`;
    if (action.type === "set_attr" && action.name === "href") return `${name} 링크 바꾸기`;
    if (action.type === "set_attr") return `${name} 속성 변경`;
    if (action.type === "add_class") return `${name} 클래스 추가`;
    if (action.type === "remove_class") return `${name} 클래스 제거`;
    return name;
  }

  function withChangeMeta(change, info) {
    const base = { ...change };
    if (base.type === "inject_css") {
      base.label = base.label || "고급 CSS 규칙 적용";
      base.detail = base.detail || "고급 사용자를 위한 사용자 정의 규칙이에요.";
      return base;
    }

    base.element_name = getFriendlyElementName(info);
    base.label = buildChangeLabel(base);
    base.detail = buildFriendlyDetail(base);
    return base;
  }

  function setComposerMode(mode) {
    currentComposerMode = mode;
    intentButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));

    valueRow.style.display = mode === "text" ? "flex" : "none";
    attrRow.style.display = "none";
    cssRow.style.display = "none";
    styleRow.style.display = "none";
    textPanel.style.display = mode === "text" ? "block" : "none";
    stylePanel.style.display = mode === "style" ? "block" : "none";
    visibilityPanel.style.display = mode === "visibility" ? "block" : "none";
    linkPanel.style.display = mode === "link" ? "block" : "none";
    advancedEditorBox.style.display = mode === "advanced" ? "block" : "none";
    if (mode === "advanced") {
      advancedEditorBox.open = true;
      actionType.dispatchEvent(new Event("change"));
    }

    if (mode === "text") {
      valueLabel.textContent = "새 문구";
      addChangeBtn.textContent = "문구 변경 추가";
    } else if (mode === "style") {
      addChangeBtn.textContent = "스타일 변경 추가";
    } else if (mode === "visibility") {
      addChangeBtn.textContent = "노출 변경 추가";
    } else if (mode === "link") {
      addChangeBtn.textContent = "링크 변경 추가";
    } else {
      addChangeBtn.textContent = "고급 변경 추가";
    }
  }

  function parseStyleDeclarations(input) {
    const raw = String(input || "").trim();
    if (!raw) {
      return { ok: false, reason: "스타일 선언을 입력하세요." };
    }

    const styles = {};
    const chunks = raw.split(/;|\r?\n/);

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line) continue;

      const colonIdx = line.indexOf(":");
      if (colonIdx <= 0) {
        return { ok: false, reason: `잘못된 선언: ${line}` };
      }

      const property = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!property || !value) {
        return { ok: false, reason: `잘못된 선언: ${line}` };
      }

      styles[property] = value;
    }

    const entries = Object.entries(styles);
    if (entries.length === 0) {
      return { ok: false, reason: "스타일 선언을 입력하세요." };
    }

    return { ok: true, styles };
  }

  function normalizeChangeFromUI() {
    const isAdvancedCss = currentComposerMode === "advanced" && actionType.value === "inject_css";
    if (!lastSelected && !isAdvancedCss) {
      alert("먼저 iframe에서 요소를 클릭해 선택하세요.");
      return null;
    }

    if (currentComposerMode === "text") {
      const value = (actionValue.value || "").trim();
      if (!value) { alert("새 문구를 입력하세요."); return null; }
      return withChangeMeta({
        selector: lastSelected.selector,
        actions: [{ type: "set_text", value }]
      }, lastSelected);
    }

    if (currentComposerMode === "style") {
      const built = buildStyleObjectFromControls();
      if (!built.ok) { alert(built.reason); return null; }
      return withChangeMeta({
        selector: lastSelected.selector,
        actions: [{ type: "set_style", styles: built.styles }]
      }, lastSelected);
    }

    if (currentComposerMode === "visibility") {
      const type = getVisibilityMode();
      return withChangeMeta({
        selector: lastSelected.selector,
        actions: [{ type }]
      }, lastSelected);
    }

    if (currentComposerMode === "link") {
      const href = (linkHrefValue.value || "").trim();
      const label = (linkLabelValue.value || "").trim();
      if (!href) { alert("이동 주소를 입력하세요."); return null; }
      const actions = [{ type: "set_attr", name: "href", value: href }];
      if (label) {
        actions.push({ type: "set_attr", name: "aria-label", value: label });
        actions.push({ type: "set_attr", name: "title", value: label });
      }
      return withChangeMeta({
        selector: lastSelected.selector,
        actions
      }, lastSelected);
    }

    const type = actionType.value;

    if (type === "inject_css") {
      const css = (cssValue.value || "").trim();
      if (!css) { alert("CSS 내용을 입력하세요."); return null; }
      return withChangeMeta({ type: "inject_css", css }, lastSelected);
    }

    const selector = lastSelected.selector;
    if (!selector) { alert("selector가 없습니다."); return null; }

    if (type === "hide" || type === "show") {
      return withChangeMeta({ selector, actions: [{ type }] }, lastSelected);
    }

    if (type === "set_text") {
      const v = (actionValue.value || "").trim();
      if (!v) { alert("텍스트를 입력하세요."); return null; }
      return withChangeMeta({ selector, actions: [{ type: "set_text", value: v }] }, lastSelected);
    }

    if (type === "set_style") {
      const parsed = parseStyleDeclarations(styleValue.value);
      if (!parsed.ok) { alert(parsed.reason); return null; }
      return withChangeMeta({ selector, actions: [{ type: "set_style", styles: parsed.styles }] }, lastSelected);
    }

    if (type === "add_class" || type === "remove_class") {
      const v = (actionValue.value || "").trim();
      if (!v) { alert("클래스명을 입력하세요."); return null; }
      return withChangeMeta({ selector, actions: [{ type, value: v }] }, lastSelected);
    }

    if (type === "set_attr") {
      const n = (attrName.value || "").trim();
      const v = (attrValue.value || "").trim();
      if (!n) { alert("attr name을 입력하세요."); return null; }
      return withChangeMeta({ selector, actions: [{ type: "set_attr", name: n, value: v }] }, lastSelected);
    }

    alert("지원하지 않는 action입니다.");
    return null;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderChangesList() {
    changesList.innerHTML = "";
    if (changesB.length === 0) {
      changesList.innerHTML = `<div class="changeMeta">변경 없음 (Variant B)</div>`;
      return;
    }

    changesB.forEach((c, idx) => {
      const el = document.createElement("div");
      el.className = "changeItem";

      let meta = "";
      let code = "";

      if (c.type === "inject_css") {
        meta = `#${idx} · ${escapeHtml(c.label || "고급 CSS 규칙 적용")}`;
        code = c.detail || "고급 CSS 규칙이 추가돼요.";
      } else {
        meta = `#${idx} · ${escapeHtml(c.label || c.element_name || "변경")}`;
        code = c.detail || buildFriendlyDetail(c);
      }

      el.innerHTML = `
        <div class="changeTop">
          <div>
            <div class="changeMeta">${meta}</div>
            <div class="mono changeCode">${escapeHtml(code)}</div>
          </div>
          <div class="changeBtns">
            <button class="btn smallBtn" data-act="apply" data-idx="${idx}">프리뷰(B)</button>
            <button class="btn danger smallBtn" data-act="del" data-idx="${idx}">삭제</button>
          </div>
        </div>
      `;

      changesList.appendChild(el);
    });
  }

  function mergeImportedChange(change) {
    if (!change || typeof change !== "object") return null;
    if (change.type === "inject_css") {
      return withChangeMeta(change, lastSelected);
    }
    if (!change.selector || !Array.isArray(change.actions)) return null;
    const info = {
      selector: change.selector,
      tag: change.tag || null,
      track_id: change.track_id || null,
      text: change.text || change.element_name || "",
      rect: change.rect || null,
      page: change.page || null,
    };
    const merged = withChangeMeta(change, info);
    if (change.element_name) merged.element_name = change.element_name;
    if (change.label) merged.label = change.label;
    if (change.detail) merged.detail = change.detail;
    return merged;
  }

  async function fetchSiteConfig() {
    const r = await fetch(`/api/sites/${encodeURIComponent(currentSiteId)}`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "site fetch failed");
    return j.site || null;
  }

  function getPreviewTargets() {
    return Array.isArray(currentSiteConfig?.preview_targets) ? currentSiteConfig.preview_targets : [];
  }

  function getTargetById(targetId) {
    return getPreviewTargets().find((target) => target.id === targetId) || null;
  }

  function getDefaultTarget() {
    const targets = getPreviewTargets();
    return targets.find((target) => target.default) || targets[0] || null;
  }

  function populateTargetSelect() {
    const targets = getPreviewTargets();
    targetSelect.innerHTML = "";

    if (targets.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "preview target 없음";
      targetSelect.appendChild(option);
      targetSelect.disabled = true;
      return;
    }

    targets.forEach((target) => {
      const option = document.createElement("option");
      option.value = target.id;
      option.textContent = target.label || target.url_prefix || target.id;
      targetSelect.appendChild(option);
    });
    targetSelect.disabled = false;
  }

  function applyTarget(target, options) {
    if (!target) return;
    currentTarget = target;
    targetSelect.value = target.id;
    frame.src = target.preview_url;
    if (!options?.preserveExpKey) {
      expKeyInput.value = target.experiment_key || getDefaultExpKey();
    }
    urlPrefixInput.value = target.url_prefix || "/";
    updateEditorCopilotMeta();
    log(`navigate iframe -> ${target.preview_url}`);
  }

  function setTargetByPath(pathname) {
    if (!pathname) return;
    const match = getPreviewTargets()
      .filter((target) => pathname.startsWith(target.url_prefix || "/"))
      .sort((a, b) => (b.url_prefix || "").length - (a.url_prefix || "").length)[0] || getDefaultTarget();
    if (!match) return;
    applyTarget(match, { preserveExpKey: true });
    urlPrefixInput.value = pathname === "/" ? "/" : pathname;
  }

  function applyDraftPayload(payload, options) {
    const draft = payload?.draft || null;
    const imported = Array.isArray(payload?.changesB) ? payload.changesB.map(mergeImportedChange).filter(Boolean) : [];
    if (draft?.target_page) setTargetByPath(draft.target_page);
    if (draft?.key) expKeyInput.value = draft.key;
    if (draft?.target_page) urlPrefixInput.value = draft.target_page;
    if (imported.length > 0) {
      changesB = imported;
      renderChangesList();
      jsonBox.value = JSON.stringify({ variantB: changesB, source: "analytics_copilot" }, null, 2);
      setVariant("B");
      applyPreviewNow();
    }
    latestImportedDraft = payload || null;
    applyImportedDraftBtn.disabled = !latestImportedDraft;
    editorImportedState.textContent = draft
      ? `초안 가져옴 - ${draft.key || "draft"} / 변경 ${imported.length}개`
      : imported.length > 0
        ? `변경 ${imported.length}개 가져옴`
        : "가져온 변경 없음";
    log(`copilot draft imported (${imported.length} changes)`);
    if (!options?.keepStorage) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }

  function loadPendingDraftFromStorage() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      applyDraftPayload(payload);
    } catch (e) {
      log(`copilot draft load failed: ${String(e)}`);
    }
  }

  function initCopilot() {
    if (!window.AnalyticsChat) return;
    copilot = window.AnalyticsChat.init({
      rootId: "editorCopilotRoot",
      page: "editor",
      floatingStorageKey: "editor-copilot",
      getContext() {
        return {
          page: "editor",
          selectedElement: lastSelected,
          selectedExperimentKey: (expKeyInput.value || "").trim() || null,
        };
      },
      onExperimentDraft(draft) {
        latestImportedDraft = {
          draft,
          changesB: Array.isArray(draft?.variant_b_changes) ? draft.variant_b_changes : [],
        };
        applyImportedDraftBtn.disabled = false;
        editorImportedState.textContent = `새 초안 도착 - ${draft?.key || "draft"}`;
      },
      onEditorChanges(changes, draft) {
        applyDraftPayload({ draft, changesB: changes }, { keepStorage: true });
      },
    });
  }

  function applyPreviewNow() {
    if (currentVariant !== "B") {
      setVariant("B");
      log(`preview apply (B, ${changesB.length})`);
      return;
    }
    postToFrame("EDITOR_PREVIEW_SET_VARIANT", { variant: "B", changes: changesB });
    log(`preview apply (B, ${changesB.length})`);
  }

  function getDefaultExpKey() {
    if (currentTarget?.experiment_key) return currentTarget.experiment_key;
    const path = currentTarget?.url_prefix || "/";
    if (path.startsWith("/checkout")) return "exp_checkout_cta_v1";
    if (path.startsWith("/detail")) return "exp_detail_cta_v1";
    if (path.startsWith("/collection")) return "exp_collection_cta_v1";
    return "exp_main_cta_v1";
  }

  function getDefaultUrlPrefix() {
    const path = currentTarget?.url_prefix || "/";
    return path === "/" ? "/" : path;
  }

  function updateEditorCopilotMeta() {
    editorCopilotExpKey.textContent = (expKeyInput.value || "").trim() || getDefaultExpKey();
    if (copilot) {
      copilot.setSelectedExperimentKey((expKeyInput.value || "").trim() || null);
      copilot.setSelectedElement(lastSelected);
    }
  }

  function setEditorCopilotCollapsed(collapsed) {
    editorCopilotRoot.classList.toggle("is-collapsed", collapsed);
    editorCopilotToggleBtn.textContent = collapsed ? "열기" : "접기";
    editorCopilotToggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  async function realApplyToServer() {
    const expKey = (expKeyInput.value || "").trim() || getDefaultExpKey();
    const urlPrefix = (urlPrefixInput.value || "").trim() || getDefaultUrlPrefix();

    if (!expKey) { alert("experiment key가 필요합니다."); return; }
    if (!urlPrefix) { alert("url prefix가 필요합니다."); return; }

    // Real 적용은 서버에 “running”으로 저장/배포
    const payload = {
      site_id: currentSiteId,
      key: expKey,
      url_prefix: urlPrefix,
      traffic: { A: 50, B: 50 },
      goals: ["checkout_complete"],
      variants: {
        A: [],         // A는 원본(변경 없음)
        B: changesB    // B에만 변경
      }
    };

    try {
      const r = await fetch("/api/experiments/real-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      const j = await r.json();
      if (!j?.ok) {
        alert("Real 적용 실패: " + (j?.reason || "unknown"));
        log("real apply failed");
        return;
      }

      log(`✅ Real applied: ${expKey} (v${j.experiment.version}) url_prefix=${urlPrefix}`);

      // Real 적용 후: 실제 동작 확인을 위해 새 탭으로 열기
      const liveUrl = currentTarget?.live_url || currentTarget?.preview_url || "/";
      const realUrl = new URL(liveUrl, location.origin);
      realUrl.searchParams.set("__real", "1"); // 표시용(필수 아님)
      window.open(realUrl.toString(), "_blank", "noopener,noreferrer");

      alert(`Real 적용 완료!\n이제 새 탭에서 SDK가 서버 설정을 받아 A/B를 자동 실행합니다.\n(유저마다 A/B가 다를 수 있음)`);
    } catch (e) {
      alert("Real 적용 실패(네트워크): " + String(e));
      log(`real apply error: ${String(e)}`);
    }
  }

  // --- UI hooks ---
  targetSelect.addEventListener("change", () => {
    const target = getTargetById(targetSelect.value) || getDefaultTarget();
    if (!target) return;
    applyTarget(target);
  });

  expKeyInput.addEventListener("input", () => updateEditorCopilotMeta());

  reloadBtn.addEventListener("click", () => {
    frame.contentWindow.location.reload();
    log("iframe reload");
  });

  intentButtons.forEach((btn) => {
    btn.addEventListener("click", () => setComposerMode(btn.dataset.mode || "text"));
  });

  togglePickBtn.addEventListener("click", () => setPickMode(!pickMode));
  variantABtn.addEventListener("click", () => setVariant("A"));
  variantBBtn.addEventListener("click", () => setVariant("B"));

  actionType.addEventListener("change", () => {
    const t = actionType.value;
    if (currentComposerMode !== "advanced") return;

    textPanel.style.display = "none";
    stylePanel.style.display = "none";
    visibilityPanel.style.display = "none";
    linkPanel.style.display = "none";

    valueRow.style.display = "none";
    attrRow.style.display = "none";
    cssRow.style.display = "none";
    styleRow.style.display = "none";

    if (t === "set_text" || t === "add_class" || t === "remove_class") {
      textPanel.style.display = "block";
      valueRow.style.display = "flex";
      valueLabel.textContent = t === "set_text" ? "새 문구" : "값";
      if (t === "add_class") actionValue.placeholder = "예: primary";
      if (t === "remove_class") actionValue.placeholder = "예: primary";
    }
    if (t === "set_attr") attrRow.style.display = "flex";
    if (t === "inject_css") cssRow.style.display = "flex";
    if (t === "set_style") styleRow.style.display = "flex";
    if (t === "hide" || t === "show") {/* none */}
  });

  addChangeBtn.addEventListener("click", () => {
    const change = normalizeChangeFromUI();
    if (!change) return;

    changesB.push(change);
    renderChangesList();
    log(`change added (#${changesB.length - 1})`);

    if (currentVariant === "B") applyPreviewNow();
  });

  applyNowBtn.addEventListener("click", () => applyPreviewNow());
  realApplyBtn.addEventListener("click", () => realApplyToServer());

  openRealBtn.addEventListener("click", () => {
    const liveUrl = currentTarget?.live_url || currentTarget?.preview_url || "/";
    const u = new URL(liveUrl, location.origin);
    u.searchParams.set("__real", "1");
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  });

  clearChangesBtn.addEventListener("click", () => {
    if (!confirm("Variant B 변경을 모두 삭제할까요?")) return;
    changesB = [];
    renderChangesList();
    jsonBox.value = "";
    log("changes cleared");
    if (currentVariant === "B") applyPreviewNow();
  });

  changesList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const act = btn.dataset.act;

    if (!Number.isFinite(idx) || idx < 0 || idx >= changesB.length) return;

    if (act === "del") {
      changesB.splice(idx, 1);
      renderChangesList();
      log(`change deleted (#${idx})`);
      if (currentVariant === "B") applyPreviewNow();
    }
    if (act === "apply") {
      applyPreviewNow();
    }
  });

  exportJsonBtn.addEventListener("click", () => {
    const out = {
      variantB: changesB,
      meta: {
        target: targetSelect.value,
        exported_at: new Date().toISOString()
      }
    };
    jsonBox.value = JSON.stringify(out, null, 2);
    log("export json");
  });

  copyJsonBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(jsonBox.value || "");
      log("copied json");
    } catch (e) {
      alert("복사 실패: 브라우저 권한을 확인하세요.");
      log(`copy failed: ${String(e)}`);
    }
  });

  applyImportedDraftBtn.addEventListener("click", () => {
    if (!latestImportedDraft) return;
    applyDraftPayload(latestImportedDraft, { keepStorage: true });
  });
  editorCopilotToggleBtn.addEventListener("click", () => {
    setEditorCopilotCollapsed(!editorCopilotRoot.classList.contains("is-collapsed"));
  });

  // iframe load hook
  frame.addEventListener("load", () => {
    log("iframe loaded");
    injectOverlay();
  });

  // iframe → parent 메시지 수신
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data || {};

    if (data.type === "EDITOR_ELEMENT_HOVER") {
      statusText.textContent = `가리키는 중: ${getFriendlyElementName(data)}`;
      return;
    }

    if (data.type === "EDITOR_ELEMENT_SELECTED") {
      statusText.textContent = `${getFriendlyElementName(data)} 선택됨`;
      lastSelected = data;
      renderSelected(lastSelected);
      updateEditorCopilotMeta();
      if (lastSelected.text) actionValue.placeholder = `예: ${lastSelected.text.slice(0, 30)}...`;
      log(`selected -> ${data.selector}`);
      return;
    }

    if (data.type === "EDITOR_APPLY_RESULT") {
      if (data.ok) {
        statusText.textContent = `미리보기 적용됨 (${data.message || "ok"})`;
        log(`apply ok: ${data.message || ""}`);
      } else {
        statusText.textContent = `미리보기 적용 실패 (${data.message || "원인 불명"})`;
        log(`apply fail: ${data.message || ""}`);
      }
      return;
    }

    if (data.type === "EDITOR_LOG") {
      log(`iframe: ${data.message}`);
      return;
    }
  });

  async function initEditor() {
    currentSiteConfig = await fetchSiteConfig();
    populateTargetSelect();

    const params = new URLSearchParams(location.search);
    const targetId = (params.get("target") || "").trim();
    const initialTarget = getTargetById(targetId) || getDefaultTarget();

    if (initialTarget) {
      applyTarget(initialTarget);
    } else {
      expKeyInput.value = getDefaultExpKey();
      urlPrefixInput.value = getDefaultUrlPrefix();
    }

    renderChangesList();
    initCopilot();
    setEditorCopilotCollapsed(true);
    setComposerMode("text");
    setPickMode(true);
    setVariant("A");
    updateEditorCopilotMeta();
    loadPendingDraftFromStorage();
    log(`editor ready (${currentSiteId})`);
  }

  initEditor().catch((error) => {
    alert(String(error));
    log(`editor init failed: ${String(error)}`);
  });
})();
