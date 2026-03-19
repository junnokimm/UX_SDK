(function (global) {
  function createNode(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === "string") el.textContent = text;
    return el;
  }

  function renderMessage(listEl, role, text) {
    const item = createNode("div", `chatMsg ${role}`);
    item.textContent = text;
    listEl.appendChild(item);
    listEl.scrollTop = listEl.scrollHeight;
  }

  function initAnalyticsChat(options) {
    const root = document.getElementById(options.rootId);
    if (!root) return null;

    const messagesEl = root.querySelector(".chatMessages");
    const inputEl = root.querySelector(".chatInput");
    const sendBtn = root.querySelector(".chatSendBtn");
    const quickButtons = root.querySelectorAll("button[data-q]");
    const statusEl = root.querySelector(".chatStatus");

    const state = {
      sessionId: `analytics_${Math.random().toString(16).slice(2, 10)}`,
      selectedExperimentKey: null,
      selectedElement: null,
      page: options.page,
    };

    function setBusy(busy, label) {
      if (sendBtn) sendBtn.disabled = busy;
      if (inputEl) inputEl.disabled = busy;
      if (statusEl) statusEl.textContent = label || (busy ? "분석 중…" : "준비 완료");
    }

    function getContext() {
      const extra = typeof options.getContext === "function" ? options.getContext() : {};
      return {
        page: state.page,
        selectedExperimentKey: state.selectedExperimentKey,
        selectedElement: state.selectedElement,
        sessionId: state.sessionId,
        ...extra,
      };
    }

    async function send(content) {
      const text = String(content || "").trim();
      if (!text) return;
      renderMessage(messagesEl, "user", text);
      setBusy(true, "분석 중…");

      const payload = {
        agent: "analytics_copilot",
        messages: [{ role: "user", content: text }],
        context: getContext(),
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.reason || "chat failed");

        renderMessage(messagesEl, "assistant", data.answer || "(no answer)");
        if (statusEl) statusEl.textContent = `응답 모드: ${data?.meta?.llmMode || "unknown"}`;

        const actions = Array.isArray(data.actions) ? data.actions : [];
        const expAction = actions.find((a) => a.type === "experiment_draft");
        if (expAction && typeof options.onExperimentDraft === "function") {
          options.onExperimentDraft(expAction.draft);
        }
        const changesAction = actions.find((a) => a.type === "editor_changes");
        if (changesAction && typeof options.onEditorChanges === "function") {
          options.onEditorChanges(changesAction.changesB || [], expAction?.draft || null);
        }
      } catch (err) {
        renderMessage(messagesEl, "assistant", `오류: ${String(err)}`);
        if (statusEl) statusEl.textContent = "오류가 발생했어요";
      } finally {
        setBusy(false, statusEl?.textContent || "준비 완료");
      }
    }

    sendBtn.addEventListener("click", () => {
      send(inputEl.value);
      inputEl.value = "";
    });

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send(inputEl.value);
        inputEl.value = "";
      }
    });

    for (const btn of quickButtons) {
      btn.addEventListener("click", () => send(btn.dataset.q || ""));
    }

    renderMessage(messagesEl, "assistant", "분석 코파일럿이 준비됐습니다. 빠른 액션 버튼이나 질문을 입력해 주세요.");
    if (statusEl) statusEl.textContent = "준비 완료";

    return {
      setSelectedExperimentKey(key) {
        state.selectedExperimentKey = key || null;
      },
      setSelectedElement(element) {
        state.selectedElement = element || null;
      },
      send,
    };
  }

  global.AnalyticsChat = { init: initAnalyticsChat };
})(window);
