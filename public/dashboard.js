// public/dashboard.js
(function () {
  const DEFAULT_SITE_ID = "legend-ecommerce";
  const SITE_STORAGE_KEY = "uxsdk.dashboard.siteId";
  const expTbody = document.getElementById("expTbody");
  const refreshBtn = document.getElementById("refreshBtn");
  const siteSelect = document.getElementById("siteSelect");
  const siteIdText = document.getElementById("siteIdText");
  const topEditorLink = document.getElementById("topEditorLink");
  const quickTestLinks = document.getElementById("quickTestLinks");
  const quickTestHint = document.getElementById("quickTestHint");

  const metricsCard = document.getElementById("metricsCard");
  const metricKeyEl = document.getElementById("metricKey");

  const cvrA = document.getElementById("cvrA");
  const cvrB = document.getElementById("cvrB");
  const ctrA = document.getElementById("ctrA");
  const ctrB = document.getElementById("ctrB");
  const brA = document.getElementById("brA");
  const brB = document.getElementById("brB");
  const countsBox = document.getElementById("countsBox");
  const topA = document.getElementById("topA");
  const topB = document.getElementById("topB");

  const uxTotalSessions = document.getElementById("uxTotalSessions");
  const uxTopLabel = document.getElementById("uxTopLabel");
  const uxHighPriorityCount = document.getElementById("uxHighPriorityCount");
  const uxInsightProvider = document.getElementById("uxInsightProvider");
  const labelBars = document.getElementById("labelBars");
  const opportunityList = document.getElementById("opportunityList");
  const labelSummaryBody = document.getElementById("labelSummaryBody");
  const sessionsBody = document.getElementById("sessionsBody");
  const insightsList = document.getElementById("insightsList");
  const helpButtons = Array.from(document.querySelectorAll(".helpBtn"));
  const copilotExperimentKey = document.getElementById("copilotExperimentKey");
  const copilotDraftStatus = document.getElementById("copilotDraftStatus");
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const openDraftInEditorBtn = document.getElementById("openDraftInEditorBtn");

  const DRAFT_STORAGE_KEY = "uxsdk.analyticsCopilotDraft";
  const state = {
    siteId: resolveSiteId(),
    sites: [],
    siteConfig: null,
    experiments: [],
    selectedExperimentKey: null,
    latestDraft: null,
    chatWidget: null,
    sessionsSource: "analytics",
  };

  function resolveSiteId() {
    const params = new URLSearchParams(location.search);
    const querySiteId = (params.get("site_id") || "").trim();
    const storedSiteId = (localStorage.getItem(SITE_STORAGE_KEY) || "").trim();
    return querySiteId || storedSiteId || DEFAULT_SITE_ID;
  }

  function setSiteInUrl(siteId) {
    const url = new URL(location.href);
    url.searchParams.set("site_id", siteId);
    history.replaceState({}, "", url.toString());
  }

  function ensureSiteOption(siteId) {
    if (!siteSelect || !siteId) return;
    const hasOption = Array.from(siteSelect.options).some((option) => option.value === siteId);
    if (!hasOption) {
      const option = document.createElement("option");
      option.value = siteId;
      option.textContent = siteId;
      siteSelect.appendChild(option);
    }
  }

  function getCurrentSiteId() {
    return state.siteId || DEFAULT_SITE_ID;
  }

  async function fetchSites() {
    const r = await fetch("/api/sites");
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "sites fetch failed");
    return Array.isArray(j.sites) ? j.sites : [];
  }

  function getCurrentSiteConfig() {
    if (state.siteConfig?.site_id === getCurrentSiteId()) return state.siteConfig;
    return state.sites.find((site) => site.site_id === getCurrentSiteId()) || null;
  }

  function populateSiteSelect() {
    if (!siteSelect) return;
    const current = getCurrentSiteId();
    siteSelect.innerHTML = "";

    const sites = state.sites.length ? state.sites : [{ site_id: current, name: current }];
    sites.forEach((site) => {
      const option = document.createElement("option");
      option.value = site.site_id;
      option.textContent = site.name ? `${site.name} (${site.site_id})` : site.site_id;
      siteSelect.appendChild(option);
    });

    ensureSiteOption(current);
    siteSelect.value = current;
  }

  function renderQuickTestLinks() {
    if (!quickTestLinks) return;
    const site = getCurrentSiteConfig();
    const targets = Array.isArray(site?.preview_targets) ? site.preview_targets.slice(0, 3) : [];
    if (targets.length === 0) {
      quickTestLinks.innerHTML = '<span class="muted">preview target이 없습니다.</span>';
      return;
    }

    quickTestLinks.innerHTML = targets.map((target) => `
      <a class="btn primary" href="${escapeHtml(target.live_url || target.preview_url || "/")}" target="_blank" rel="noopener">${escapeHtml(target.label || target.url_prefix || "Open")}</a>
    `).join("");
  }

  function getEditorUrl(extraParams) {
    const url = new URL("/editor", location.origin);
    url.searchParams.set("site_id", getCurrentSiteId());
    if (extraParams && typeof extraParams === "object") {
      Object.entries(extraParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          url.searchParams.set(key, String(value));
        }
      });
    }
    return `${url.pathname}${url.search}`;
  }

  function updateSiteContextUI() {
    const siteId = getCurrentSiteId();
    state.siteConfig = getCurrentSiteConfig();
    ensureSiteOption(siteId);
    populateSiteSelect();
    if (siteIdText) siteIdText.textContent = siteId;
    if (topEditorLink) topEditorLink.href = getEditorUrl();
    renderQuickTestLinks();
    if (quickTestHint) {
      quickTestHint.textContent = siteId === "legend-ecommerce"
        ? "현재 dashboard는 Ecommerce 전용 데이터(legend-ecommerce)를 보고 있습니다. Quick Test와 Visual Editor도 이 사이트의 preview target을 기준으로 동작합니다."
        : "현재 dashboard는 선택된 site_id 기준으로 동작합니다. 다른 유저처럼 보려면 시크릿 창 또는 localStorage 삭제.";
    }
  }

  function fmtPct(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return (x * 100).toFixed(2) + "%";
  }
  function fmtDate(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleString();
  }
  function fmtInt(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return Math.round(x).toLocaleString();
  }
  function fmtDuration(ms) {
    if (typeof ms !== "number" || !isFinite(ms)) return "—";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function closeHelpPopovers() {
    helpButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      const popover = document.getElementById(button.dataset.helpTarget || "");
      if (popover) popover.classList.remove("is-open");
    });
  }
  function toggleHelpPopover(button) {
    const targetId = button?.dataset.helpTarget || "";
    const popover = document.getElementById(targetId);
    if (!popover) return;

    const willOpen = !popover.classList.contains("is-open");
    closeHelpPopovers();
    if (willOpen) {
      popover.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
    }
  }

  async function fetchExperiments() {
    const r = await fetch(`/api/experiments?site_id=${encodeURIComponent(getCurrentSiteId())}`);
    const j = await r.json();
    if (!j?.ok) throw new Error("experiments fetch failed");
    return j.experiments || [];
  }

  async function setStatus(id, status) {
    const siteId = getCurrentSiteId();
    const r = await fetch(`/api/experiments/${encodeURIComponent(id)}?site_id=${encodeURIComponent(siteId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, site_id: siteId })
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "status update failed");
    return j.experiment;
  }

  async function saveDraftExperiment(payload) {
    const r = await fetch("/api/experiments/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "draft save failed");
    return j.experiment;
  }

  async function deleteExp(id) {
    const r = await fetch(`/api/experiments/${encodeURIComponent(id)}?site_id=${encodeURIComponent(getCurrentSiteId())}`, {
      method: "DELETE"
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "delete failed");
  }

  async function fetchMetrics(key) {
    const r = await fetch(`/api/metrics?site_id=${encodeURIComponent(getCurrentSiteId())}&key=${encodeURIComponent(key)}`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "metrics failed");
    return j;
  }
  async function fetchSessions() {
    const siteId = encodeURIComponent(getCurrentSiteId());

    try {
      const realtimeResponse = await fetch(`/api/realtime/sessions?site_id=${siteId}&limit=12`);
      const realtimeJson = await realtimeResponse.json();
      if (realtimeJson?.ok) {
        state.sessionsSource = realtimeJson.source || "redis";
        return Array.isArray(realtimeJson.sessions) ? realtimeJson.sessions : [];
      }
    } catch (_) {
      // fallback to analytics sessions below
    }

    const r = await fetch(`/api/sessions?site_id=${siteId}&limit=12`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "sessions failed");
    state.sessionsSource = "analytics";
    return j.sessions || [];
  }
  async function fetchLabelsSummary() {
    const r = await fetch(`/api/labels/summary?site_id=${encodeURIComponent(getCurrentSiteId())}`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "labels summary failed");
    return j.summary || [];
  }
  async function fetchInsights() {
    const r = await fetch(`/api/insights?site_id=${encodeURIComponent(getCurrentSiteId())}&reps=3`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "insights failed");
    return j;
  }

  function getExperimentByKey(key) {
    return state.experiments.find((exp) => exp.key === key) || null;
  }

  function updateCopilotExperimentUI() {
    copilotExperimentKey.textContent = state.selectedExperimentKey || "아직 선택 안 됨";
    if (state.chatWidget) {
      state.chatWidget.setSelectedExperimentKey(state.selectedExperimentKey);
    }
  }

  function stageDraftForEditor(draft, changes) {
    if (!draft && !Array.isArray(changes)) return;
    const payload = {
      draft: draft || null,
      changesB: Array.isArray(changes) ? changes : [],
      selectedExperimentKey: state.selectedExperimentKey,
      savedAt: Date.now(),
    };
    state.latestDraft = payload;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    openDraftInEditorBtn.disabled = false;
    saveDraftBtn.disabled = false;
    const changeCount = payload.changesB.length;
    copilotDraftStatus.textContent = draft
      ? `초안 준비됨 - ${draft.key || "draft"} / 변경 ${changeCount}개`
      : `변경 ${changeCount}개 준비됨`;
  }

  function stageExperimentForEditor(exp) {
    const payload = {
      draft: {
        key: exp.key,
        target_page: exp.url_prefix,
        hypothesis: exp.hypothesis || "",
      },
      changesB: Array.isArray(exp?.variants?.B) ? exp.variants.B : [],
      selectedExperimentKey: exp.parent_key || exp.key || null,
      savedAt: Date.now(),
    };
    state.latestDraft = payload;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    openDraftInEditorBtn.disabled = false;
    saveDraftBtn.disabled = exp.status === "draft";
    copilotDraftStatus.textContent = `${exp.status === "draft" ? "저장된 draft" : "실험"} 준비됨 - ${exp.key}`;
  }

  async function persistLatestDraft() {
    if (!state.latestDraft) return;
    const draft = state.latestDraft.draft || {};
    const changesB = Array.isArray(state.latestDraft.changesB) ? state.latestDraft.changesB : [];
      const payload = {
      site_id: getCurrentSiteId(),
      key: draft.key || state.selectedExperimentKey || `exp_copilot_${Date.now()}`,
      url_prefix: draft.target_page || "/",
      traffic: { A: 50, B: 50 },
      goals: [draft.primary_goal || "checkout_complete"],
      variants: {
        A: [],
        B: changesB,
      },
      hypothesis: draft.hypothesis || "analytics copilot draft",
      source: "analytics_copilot",
    };

    const saved = await saveDraftExperiment(payload);
    stageExperimentForEditor(saved);
    await render();
    return saved;
  }

  function renderTop(list) {
    if (!Array.isArray(list) || list.length === 0) return "—";
    return list.map((x) => `${String(x.element_id).padEnd(18)}  ${x.count}`).join("\n");
  }
  function labelName(label) {
    const map = {
      ux_friction_dropper: "UX Friction",
      checkout_abandoner: "Checkout Abandoner",
      price_sensitive_dropper: "Price Sensitive",
      over_explorer: "Over Explorer",
      window_shopper: "Window Shopper"
    };
    return map[label] || label || "unknown";
  }
  function renderLabelBars(summary) {
    if (!Array.isArray(summary) || summary.length === 0) {
      labelBars.innerHTML = '<div class="muted">라벨 데이터가 없습니다.</div>';
      return;
    }

    labelBars.innerHTML = summary.map((item) => {
      const share = typeof item.share === "number" ? item.share : 0;
      const pct = Math.max(0, Math.min(100, share * 100));
      return `
        <div class="barRow">
          <div class="barMeta">
            <span>${escapeHtml(labelName(item.label))}</span>
            <span class="mono">${fmtInt(item.sessions)} / ${fmtPct(share)}</span>
          </div>
          <div class="barTrack"><div class="barFill" style="width:${pct.toFixed(2)}%"></div></div>
        </div>
      `;
    }).join("");
  }
  function renderOpportunities(insights) {
    if (!Array.isArray(insights) || insights.length === 0) {
      opportunityList.innerHTML = '<div class="muted">인사이트가 없습니다.</div>';
      return;
    }

    opportunityList.innerHTML = insights.slice(0, 3).map((insight) => `
      <div class="opportunityItem">
        <div class="opportunityTitle">
          <strong>${escapeHtml(labelName(insight.label))}</strong>
          <span class="badge ${escapeHtml(insight.priority || "low")}">${escapeHtml(insight.priority || "low")}</span>
        </div>
        <div class="insightText">${escapeHtml(insight.where || "")}</div>
      </div>
    `).join("");
  }
  function renderLabelSummary(summary) {
    if (!Array.isArray(summary) || summary.length === 0) {
      labelSummaryBody.innerHTML = '<tr><td colspan="6" class="muted">라벨 요약 데이터가 없습니다.</td></tr>';
      return;
    }

    labelSummaryBody.innerHTML = summary.map((item) => `
      <tr>
        <td><span class="badge label">${escapeHtml(labelName(item.label))}</span></td>
        <td class="mono">${fmtInt(item.sessions)}</td>
        <td class="mono">${fmtPct(item.share)}</td>
        <td class="mono">${fmtDuration(item.metrics?.avg_duration_ms)}</td>
        <td class="mono">${typeof item.metrics?.avg_depth === "number" ? item.metrics.avg_depth.toFixed(1) : "—"}</td>
        <td class="mono">${fmtPct(item.metrics?.checkout_complete_rate)}</td>
      </tr>
    `).join("");
  }
  function renderSessions(sessions) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
      sessionsBody.innerHTML = '<tr><td colspan="9" class="muted">세션 데이터가 없습니다.</td></tr>';
      return;
    }

    if (state.sessionsSource === "redis") {
      sessionsBody.innerHTML = sessions.map((session) => `
        <tr>
          <td class="mono">${escapeHtml(session.session_id || "—")}</td>
          <td><span class="badge label">Realtime</span></td>
          <td class="mono">—</td>
          <td class="mono">${fmtDuration((Number(session.last_ts) || 0) - (Number(session.started_at) || 0))}</td>
          <td class="mono">${fmtInt(session.page_view_count)}</td>
          <td class="mono">${fmtInt(session.click_count)}</td>
          <td class="mono">${fmtInt(session.event_count)}</td>
          <td class="mono">${escapeHtml(session.max_step || "—")}</td>
          <td class="mono">${session.checkout_completed ? "complete" : (session.checkout_started ? "entered" : "no")}</td>
        </tr>
      `).join("");
      return;
    }

    sessionsBody.innerHTML = sessions.map((entry) => {
      const summary = entry.summary || {};
      const label = entry.label || {};
      return `
        <tr>
          <td class="mono">${escapeHtml(summary.session_id || "—")}</td>
          <td><span class="badge label">${escapeHtml(labelName(label.label))}</span></td>
          <td class="mono">${fmtPct(label.confidence)}</td>
          <td class="mono">${fmtDuration(summary.duration_ms)}</td>
          <td class="mono">${fmtInt(summary.page_views)}</td>
          <td class="mono">${fmtInt(summary.clicks)}</td>
          <td class="mono">${fmtInt(summary.depth)}</td>
          <td class="mono">${escapeHtml(summary.max_step || "—")}</td>
          <td class="mono">${summary.checkout_complete ? "complete" : (summary.checkout_entered ? "entered" : "no")}</td>
        </tr>
      `;
    }).join("");
  }
  function renderInsights(data) {
    const insights = Array.isArray(data?.output?.insights) ? data.output.insights : [];
    uxInsightProvider.textContent = data?.provider || "—";
    uxHighPriorityCount.textContent = String(insights.filter((item) => item.priority === "high").length);

    if (insights.length === 0) {
      insightsList.innerHTML = '<div class="miniCard muted">인사이트가 없습니다.</div>';
      return;
    }

    insightsList.innerHTML = insights.map((insight) => {
      const experiments = Array.isArray(insight.recommended_experiments) ? insight.recommended_experiments : [];
      const causes = Array.isArray(insight.possible_causes) ? insight.possible_causes : [];
      const validations = Array.isArray(insight.validation_methods) ? insight.validation_methods : [];
      return `
        <article class="insightCard">
          <div class="insightHead">
            <div>
              <div class="insightTitle">${escapeHtml(labelName(insight.label))}</div>
              <div class="muted">${escapeHtml(insight.where || "")}</div>
            </div>
            <span class="badge ${escapeHtml(insight.priority || "low")}">${escapeHtml(insight.priority || "low")}</span>
          </div>

          <div class="insightText"><strong>Possible causes</strong></div>
          <ul class="compactList">${causes.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>—</li>"}</ul>

          <div class="insightText"><strong>Validation methods</strong></div>
          <ul class="compactList">${validations.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>—</li>"}</ul>

          <div class="insightText"><strong>Recommended experiments</strong></div>
          <ul class="compactList">${experiments.map((item) => `<li>${escapeHtml(item.hypothesis || "")} - ${escapeHtml(item.change || "")} (${escapeHtml(item.primary_metric || "")})</li>`).join("") || "<li>—</li>"}</ul>
        </article>
      `;
    }).join("");

    renderOpportunities(insights);
  }
  function renderUxOverview(summary, insightData) {
    const totalSessions = Array.isArray(summary)
      ? summary.reduce((sum, item) => sum + (Number(item.sessions) || 0), 0)
      : 0;
    const top = Array.isArray(summary) && summary.length ? summary[0] : null;

    uxTotalSessions.textContent = fmtInt(totalSessions);
    uxTopLabel.textContent = top ? labelName(top.label) : "—";
    renderLabelBars(summary);
    renderInsights(insightData);
  }

  async function showMetrics(key) {
    metricsCard.style.display = "block";
    metricKeyEl.textContent = key;
    state.selectedExperimentKey = key;
    updateCopilotExperimentUI();

    // loading
    cvrA.textContent = cvrB.textContent = "…";
    ctrA.textContent = ctrB.textContent = "…";
    brA.textContent = brB.textContent = "…";
    countsBox.textContent = "loading…";
    topA.textContent = topB.textContent = "…";

    const m = await fetchMetrics(key);

    cvrA.textContent = fmtPct(m.A.cvr);
    cvrB.textContent = fmtPct(m.B.cvr);
    ctrA.textContent = fmtPct(m.A.ctr);
    ctrB.textContent = fmtPct(m.B.ctr);
    brA.textContent = fmtPct(m.A.bounce_rate);
    brB.textContent = fmtPct(m.B.bounce_rate);

    countsBox.textContent =
`A: users=${m.A.users}, sessions=${m.A.sessions}, pv=${m.A.page_views}, clicks=${m.A.clicks}, conv=${m.A.conversions}
B: users=${m.B.users}, sessions=${m.B.sessions}, pv=${m.B.page_views}, clicks=${m.B.clicks}, conv=${m.B.conversions}
events=${m.totals.events}  goals=${(m.goals||[]).join(", ")}`;

    topA.textContent = renderTop(m.A.top_clicked_elements);
    topB.textContent = renderTop(m.B.top_clicked_elements);
  }

  function badge(status) {
    const cls = status === "running" ? "running" : status === "draft" ? "draft" : status === "archived" ? "label" : "paused";
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function rowHtml(exp) {
    const status = exp.status || "paused";
    const key = exp.key || "(no key)";
    const urlPrefix = exp.url_prefix || "/";
    const version = exp.version || 0;

    const btnToggle = status === "running"
      ? `<button class="btn danger" data-act="pause" data-id="${exp.id}">Pause</button>`
      : status === "draft"
        ? `<button class="btn" data-act="edit-draft" data-id="${exp.id}" data-key="${key}">Edit Draft</button>`
        : status === "archived"
          ? `<span class="muted">Archived</span>`
          : `<button class="btn good" data-act="run" data-id="${exp.id}">Run</button>`;
    const archiveBtn = status === "draft" || status === "paused"
      ? `<button class="btn danger" data-act="archive" data-id="${exp.id}">Archive</button>`
      : "";
    const metricsBtn = status === "draft"
      ? `<button class="btn" data-act="edit-draft" data-id="${exp.id}" data-key="${key}">Open In Editor</button>`
      : `<button class="btn" data-act="metrics" data-key="${key}">Metrics</button>`;

    return `
      <tr>
        <td class="mono">${key}</td>
        <td>${badge(status)}</td>
        <td class="mono">${urlPrefix}</td>
        <td class="mono">v${version}</td>
        <td>${fmtDate(exp.updated_at)}</td>
        <td>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${metricsBtn}
            ${btnToggle}
            ${archiveBtn}
            <a class="btn" href="${getEditorUrl()}" target="_blank" rel="noopener">Open Editor</a>
            <button class="btn danger" data-act="del" data-id="${exp.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }

  async function render() {
    const [sites, exps, sessions, labelSummary, insightData] = await Promise.all([
      fetchSites(),
      fetchExperiments(),
      fetchSessions(),
      fetchLabelsSummary(),
      fetchInsights()
    ]);

    state.sites = sites;
    state.siteConfig = getCurrentSiteConfig();
    state.experiments = exps;
    if (!state.selectedExperimentKey && exps.length > 0) {
      state.selectedExperimentKey = exps[0].key || null;
      updateCopilotExperimentUI();
    }

    expTbody.innerHTML = exps.length ? exps.map(rowHtml).join("") : `
      <tr><td colspan="6" class="muted">실험이 없습니다. /editor에서 Real 적용을 눌러 생성하세요.</td></tr>
    `;

    renderSessions(sessions);
    renderLabelSummary(labelSummary);
    renderUxOverview(labelSummary, insightData);
    updateSiteContextUI();
  }

  expTbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;

    const act = btn.dataset.act;

    try {
      if (act === "metrics") {
        await showMetrics(btn.dataset.key);
      } else if (act === "edit-draft") {
        const exp = state.experiments.find((item) => item.id === btn.dataset.id);
        if (!exp) throw new Error("draft not found");
        stageExperimentForEditor(exp);
        window.open(getEditorUrl({ from: "copilot" }), "_blank", "noopener");
      } else if (act === "pause") {
        await setStatus(btn.dataset.id, "paused");
        await render();
      } else if (act === "run") {
        await setStatus(btn.dataset.id, "running");
        await render();
      } else if (act === "archive") {
        await setStatus(btn.dataset.id, "archived");
        await render();
      } else if (act === "del") {
        if (!confirm("정말 삭제할까요?")) return;
        await deleteExp(btn.dataset.id);
        await render();
      }
    } catch (err) {
      alert(String(err));
    }
  });

  helpButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleHelpPopover(button);
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".helpAnchor")) return;
    closeHelpPopovers();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelpPopovers();
  });

  refreshBtn.addEventListener("click", () => render());
  if (siteSelect) {
    siteSelect.addEventListener("change", () => {
      const nextSiteId = String(siteSelect.value || "").trim() || DEFAULT_SITE_ID;
      state.siteId = nextSiteId;
      state.selectedExperimentKey = null;
      metricsCard.style.display = "none";
      localStorage.setItem(SITE_STORAGE_KEY, nextSiteId);
      setSiteInUrl(nextSiteId);
      updateSiteContextUI();
      render().catch((e) => alert(String(e)));
    });
  }
  saveDraftBtn.addEventListener("click", async () => {
    try {
      saveDraftBtn.disabled = true;
      const saved = await persistLatestDraft();
      copilotDraftStatus.textContent = `draft 저장 완료 - ${saved.key}`;
    } catch (err) {
      alert(String(err));
      saveDraftBtn.disabled = !state.latestDraft;
    }
  });
  openDraftInEditorBtn.addEventListener("click", () => {
    if (!state.latestDraft) return;
    window.open(getEditorUrl({ from: "copilot" }), "_blank", "noopener");
  });

  if (window.AnalyticsChatWidget) {
    state.chatWidget = window.AnalyticsChatWidget.init({
      fabId: "chatbotFab",
      panelId: "analyticsChatPanel",
      closeBtnId: "chatbotCloseBtn",
      messagesId: "chatMessages",
      inputId: "chatInput",
      sendBtnId: "chatSendBtn",
      selectedExperimentId: "chatSelectedExperiment",
      storageKey: "dashboard",
      onExperimentDraft(draft) {
        stageDraftForEditor(draft, draft?.variant_b_changes || []);
      },
      onEditorChanges(changes, draft) {
        stageDraftForEditor(draft, changes);
      },
    });
    updateCopilotExperimentUI();
  }

  localStorage.setItem(SITE_STORAGE_KEY, getCurrentSiteId());
  setSiteInUrl(getCurrentSiteId());
  updateSiteContextUI();
  render().catch((e) => alert(String(e)));
})();
