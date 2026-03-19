const { buildChatContext } = require("./context-builder");
const { getAnalyticsSystemPrompt, getCommerceSystemPrompt } = require("./prompts");

function createChatOrchestrator({ toolRegistry, conversationAnalyticsService, llmClient }) {
  const safeLlmClient =
    llmClient && typeof llmClient.rewrite === "function"
      ? llmClient
      : {
          mode: "mock",
          async rewrite({ draftAnswer }) {
            return { ok: true, text: draftAnswer, reason: "fallback_mock" };
          },
        };

  async function maybeLLMRewrite({ agent, answer, messages, context }) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const systemPrompt = agent === "analytics_copilot" ? getAnalyticsSystemPrompt() : getCommerceSystemPrompt();
    const response = await safeLlmClient.rewrite({
      systemPrompt,
      userPrompt: `User message: ${lastUser}\n\nDraft answer:\n${answer}\n\nContext:${JSON.stringify(context)}`,
      draftAnswer: answer,
    });
    if (!response.ok || !response.text) return answer;
    return response.text;
  }

  async function invokeTool({ catalog, allowedTools, usedTools, name, input }) {
    if (!allowedTools.includes(name)) {
      throw new Error(`tool_not_allowed:${name}`);
    }
    const fn = catalog[name];
    if (typeof fn !== "function") {
      throw new Error(`tool_not_found:${name}`);
    }

    const result = await fn(input || {});
    usedTools.push({
      tool: name,
      input: input || {},
      resultPreview:
        typeof result === "object" && result
          ? Object.keys(result).slice(0, 6)
          : Array.isArray(result)
            ? { length: result.length }
            : String(result || ""),
    });
    return result;
  }

  function detectIntent(text) {
    const q = String(text || "").toLowerCase();
    if (q.includes("환불") || q.includes("refund")) return "refund";
    if (q.includes("교환") || q.includes("exchange")) return "exchange";
    if (q.includes("취소") || q.includes("cancel")) return "cancel";
    if (q.includes("배송") || q.includes("shipping")) return "shipping";
    if (q.includes("주문") || q.includes("order")) return "order_status";
    if (q.includes("상담") || q.includes("사람") || q.includes("human")) return "handoff";
    if (q.includes("실험") || q.includes("제안") || q.includes("draft")) return "experiment";
    return "general";
  }

  function shouldGenerateDraft(text) {
    const q = String(text || "").toLowerCase();
    return ["실험", "제안", "draft", "b안", "개선", "생성", "만들어", "suggest", "generate", "create"]
      .some((k) => q.includes(k));
  }

  function shouldSaveDraft(text) {
    const q = String(text || "").toLowerCase();
    return [
      "저장",
      "저장해",
      "저장해줘",
      "draft로 저장",
      "초안 저장",
      "save draft",
      "save this draft",
    ].some((k) => q.includes(k));
  }

  function hasCommerceActionIntent(text) {
    const q = String(text || "").toLowerCase();
    return ["환불", "refund", "취소", "cancel", "교환", "exchange"].some((k) => q.includes(k));
  }

  async function runAnalyticsCopilot({ messages, context }) {
    const ctx = buildChatContext({ messages, context });
    const tools = toolRegistry.analyticsTools;
    const allowedTools = [
      "get_experiments",
      "get_metrics",
      "get_event_summary",
      "get_chat_issue_summary",
      "get_element_context",
      "suggest_experiment",
      "save_experiment_draft",
    ];

    const usedTools = [];
    const actions = [];
    const siteId = "ab-sample";
    const userText = ctx.latestUserMessage;
    const detectedIntent = detectIntent(userText);

    const experiments = await invokeTool({
      catalog: tools,
      allowedTools,
      usedTools,
      name: "get_experiments",
      input: { siteId },
    });

    const selectedExperimentKey =
      ctx.selectedExperimentKey || experiments.find((x) => x.status === "running")?.key || experiments[0]?.key || null;

    let metrics = null;
    if (selectedExperimentKey) {
      metrics = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_metrics",
        input: { siteId, key: selectedExperimentKey },
      });
    }

    const eventSummary = await invokeTool({
      catalog: tools,
      allowedTools,
      usedTools,
      name: "get_event_summary",
      input: { siteId, page: null },
    });

    const issueSummary = await invokeTool({
      catalog: tools,
      allowedTools,
      usedTools,
      name: "get_chat_issue_summary",
      input: {
        page: ctx.page && ctx.page !== "dashboard" && ctx.page !== "editor" ? ctx.page : null,
        productId: ctx.productId || null,
      },
    });

    let selectedElement = null;
    if (ctx.selectedElement) {
      selectedElement = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_element_context",
        input: { selectedElement: ctx.selectedElement },
      });
    }

    let draft = null;
    if (shouldGenerateDraft(userText)) {
      draft = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "suggest_experiment",
        input: {
          selectedExperimentKey,
          eventSummary,
          metricSummary: metrics,
          issueSummary,
          selectedElement,
        },
      });

      actions.push({ type: "experiment_draft", draft });
      actions.push({ type: "editor_changes", changesB: draft.variant_b_changes || [] });

      if (shouldSaveDraft(userText)) {
        const saved = await invokeTool({
          catalog: tools,
          allowedTools,
          usedTools,
          name: "save_experiment_draft",
          input: { siteId, draft },
        });
        actions.push({ type: "saved_experiment_draft", experiment: saved });
      }
    }

    const baseAnswer = [
      `현재 실험 수: ${experiments.length}개`,
      metrics?.ok
        ? `선택 실험(${metrics.key}) 기준 CVR A:${(metrics.A.cvr * 100).toFixed(2)}% / B:${(metrics.B.cvr * 100).toFixed(2)}%`
        : "선택 실험 metrics가 없어 전체 이벤트/이슈 기준으로 분석했습니다.",
      `상위 고객 이슈: ${
        issueSummary.issue_types?.slice(0, 3).map((x) => `${x.issueType}(${x.count})`).join(", ") || "없음"
      }`,
      draft
        ? shouldSaveDraft(userText)
          ? "요청에 따라 실험 초안을 생성하고 draft로 저장했습니다."
          : "실험 초안을 생성했습니다. 아직 저장하지 않았고 JSON 액션으로만 반환했습니다."
        : "원하면 현재 컨텍스트 기반 실험 초안을 생성할 수 있습니다.",
    ].join("\n");

    const answer = await maybeLLMRewrite({
      agent: "analytics_copilot",
      answer: baseAnswer,
      messages,
      context: { ...ctx, selectedExperimentKey },
    });

    conversationAnalyticsService.logChatEvent({
      sessionId: ctx.sessionId,
      agent: "analytics_copilot",
      role: "user",
      content: userText,
      page: ctx.page,
      productId: ctx.productId,
      orderId: null,
      userId: ctx.userId,
      detectedIntent,
      resolved: true,
      unresolved: false,
      fallback: safeLlmClient.mode === "mock",
      handedOffToHuman: false,
      relatedExperimentKey: selectedExperimentKey,
      metadata: { llmMode: safeLlmClient.mode },
    });

    conversationAnalyticsService.logChatEvent({
      sessionId: ctx.sessionId,
      agent: "analytics_copilot",
      role: "assistant",
      content: answer,
      page: ctx.page,
      productId: ctx.productId,
      orderId: null,
      userId: ctx.userId,
      detectedIntent,
      resolved: true,
      unresolved: false,
      fallback: safeLlmClient.mode === "mock",
      handedOffToHuman: false,
      relatedExperimentKey: selectedExperimentKey,
      metadata: { actionCount: actions.length },
    });

    return {
      ok: true,
      answer,
      actions,
      meta: {
        agent: "analytics_copilot",
        llmMode: safeLlmClient.mode,
        usedTools,
      },
    };
  }

  async function runCommerceSupport({ messages, context }) {
    const ctx = buildChatContext({ messages, context });
    const tools = toolRegistry.commerceTools;
    const allowedTools = [
      "search_products",
      "get_product_detail",
      "faq_search",
      "get_order_status",
      "check_order_action_eligibility",
      "create_support_ticket",
      "draft_refund_request",
      "handoff_to_human",
    ];

    const usedTools = [];
    const actions = [];
    const userText = ctx.latestUserMessage;
    const lower = userText.toLowerCase();
    const detectedIntent = detectIntent(userText);

    let unresolved = false;
    let fallback = false;
    let handedOffToHuman = false;
    let answer = "";
    let relatedOrderId = null;

    if (ctx.productId) {
      const detail = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_product_detail",
        input: { productId: ctx.productId },
      });
      if (detail && (lower.includes("상품") || lower.includes("스펙") || lower.includes("방수") || lower.includes("재고"))) {
        answer = `${detail.name} 안내입니다. 가격은 ${detail.price.toLocaleString()}원, 재고는 ${detail.stock}개이며 주요 스펙은 ${(detail.specs || []).join(
          ", "
        )} 입니다.`;
      }
    }

    if (!answer && (lower.includes("주문") || lower.includes("order")) && !hasCommerceActionIntent(userText)) {
      const orderId = (userText.match(/ORD-[0-9]+/) || [])[0] || null;
      const order = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_order_status",
        input: { orderId, userId: ctx.userId },
      });
      if (order) {
        relatedOrderId = order.id;
        answer = `주문 ${order.id} 상태는 ${order.status}입니다. 결제금액은 ${order.totalAmount.toLocaleString()}원입니다.`;
      } else {
        answer = "주문 정보를 찾지 못했습니다. 주문번호(예: ORD-1001)를 알려주시면 다시 조회하겠습니다.";
        unresolved = true;
      }
    }

    if (!answer && hasCommerceActionIntent(userText)) {
      const actionType =
        lower.includes("취소") || lower.includes("cancel")
          ? "cancel"
          : lower.includes("교환") || lower.includes("exchange")
            ? "exchange"
            : "refund";

      const order = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_order_status",
        input: { orderId: null, userId: ctx.userId },
      });
      relatedOrderId = order?.id || null;

      const eligibility = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "check_order_action_eligibility",
        input: { order, actionType },
      });

      if (eligibility.eligible) {
        const draft = await invokeTool({
          catalog: tools,
          allowedTools,
          usedTools,
          name: "draft_refund_request",
          input: { order, reason: userText, userId: ctx.userId, actionType },
        });
        actions.push({ type: "order_action_draft", draft });
        answer = `${actionType} 가능 조건에 해당해 초안을 생성했습니다. 실제 확정은 상담팀 검토 후 진행됩니다.`;
      } else {
        const ticket = await invokeTool({
          catalog: tools,
          allowedTools,
          usedTools,
          name: "create_support_ticket",
          input: {
            userId: ctx.userId,
            orderId: order?.id,
            category: actionType,
            message: `Eligibility failed: ${eligibility.reason}. User request: ${userText}`,
            priority: "normal",
            source: "commerce_support",
          },
        });
        actions.push({ type: "support_ticket", ticket });
        answer = `${actionType} 즉시 처리 조건이 아니어서 상담 티켓(${ticket.id})으로 접수했습니다.`;
      }
    }

    if (!answer && (lower.includes("상담") || lower.includes("사람") || lower.includes("human"))) {
      const handoff = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "handoff_to_human",
        input: {
          userId: ctx.userId,
          reason: userText,
          context: { page: ctx.page, productId: ctx.productId },
        },
      });
      actions.push({ type: "handoff", handoff });
      handedOffToHuman = true;
      answer = `상담원 연결 요청을 등록했습니다. 티켓 번호는 ${handoff.ticketId}입니다.`;
    }

    if (!answer) {
      const products = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "search_products",
        input: { query: userText },
      });
      const faq = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "faq_search",
        input: { query: userText },
      });

      if (products.length) {
        const p = products[0];
        answer = `문의와 가장 가까운 상품은 ${p.name}입니다. ${p.description}`;
      } else if (faq.length) {
        answer = `${faq[0].question || faq[0].title}: ${faq[0].answer}`;
      } else {
        fallback = true;
        unresolved = true;
        const ticket = await invokeTool({
          catalog: tools,
          allowedTools,
          usedTools,
          name: "create_support_ticket",
          input: {
            userId: ctx.userId,
            orderId: null,
            category: "fallback",
            message: userText,
            priority: "normal",
            source: "commerce_support_fallback",
          },
        });
        actions.push({ type: "support_ticket", ticket });
        answer = "정확한 답변을 찾지 못해 상담 티켓으로 연결하겠습니다.";
      }
    }

    answer = await maybeLLMRewrite({
      agent: "commerce_support",
      answer,
      messages,
      context: ctx,
    });

    const resolved = !unresolved;

    conversationAnalyticsService.logChatEvent({
      sessionId: ctx.sessionId,
      agent: "commerce_support",
      role: "user",
      content: userText,
      page: ctx.page,
      productId: ctx.productId,
      orderId: relatedOrderId,
      userId: ctx.userId,
      detectedIntent,
      resolved: false,
      unresolved: false,
      fallback: false,
      handedOffToHuman: false,
      relatedExperimentKey: null,
      metadata: { llmMode: safeLlmClient.mode },
    });

    conversationAnalyticsService.logChatEvent({
      sessionId: ctx.sessionId,
      agent: "commerce_support",
      role: "assistant",
      content: answer,
      page: ctx.page,
      productId: ctx.productId,
      orderId: relatedOrderId,
      userId: ctx.userId,
      detectedIntent,
      resolved,
      unresolved,
      fallback,
      handedOffToHuman,
      relatedExperimentKey: null,
      metadata: { actionCount: actions.length },
    });

    return {
      ok: true,
      answer,
      actions,
      meta: {
        agent: "commerce_support",
        llmMode: safeLlmClient.mode,
        usedTools,
        unresolved,
        fallback,
      },
    };
  }

  async function handleChat({ agent, messages, context }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: false, reason: "messages_required" };
    }
    if (agent === "analytics_copilot") return runAnalyticsCopilot({ messages, context });
    if (agent === "commerce_support") return runCommerceSupport({ messages, context });
    return { ok: false, reason: "unsupported_agent" };
  }

  return { handleChat };
}

module.exports = { createChatOrchestrator };
