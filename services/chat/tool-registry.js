function createToolRegistry({
  experimentsService,
  metricsService,
  eventsService,
  conversationAnalyticsService,
  productService,
  faqService,
  orderService,
  supportService,
}) {
  const analyticsTools = {
    get_experiments: async ({ siteId }) => experimentsService.listExperiments(siteId),
    get_metrics: async ({ siteId, key }) => metricsService.getMetrics({ siteId, key }),
    get_event_summary: async ({ siteId, page }) => eventsService.getEventSummary({ siteId, page }),
    get_chat_issue_summary: async ({ page, productId }) =>
      conversationAnalyticsService.getChatIssueSummary({ page, productId }),
    get_element_context: async ({ selectedElement }) => {
      if (!selectedElement) return null;
      const fallbackSelector = selectedElement.track_id ? `[data-track-id='${selectedElement.track_id}']` : null;
      return {
        selector: selectedElement.selector || fallbackSelector,
        tag: selectedElement.tag || null,
        track_id: selectedElement.track_id || null,
        text: selectedElement.text || "",
        rect: selectedElement.rect || null,
        page: selectedElement.page || null,
      };
    },
    suggest_experiment: async ({ selectedExperimentKey, eventSummary, metricSummary, issueSummary, selectedElement }) => {
      const targetSelector = selectedElement?.selector || "[data-track-id='pay_btn']";
      const baseKey = selectedExperimentKey || "exp_generated";
      const problemTag = issueSummary?.issue_types?.[0]?.issueType || "funnel_drop";
      const cvrA = metricSummary?.A?.cvr || 0;
      const cvrB = metricSummary?.B?.cvr || 0;

      return {
        key: `${baseKey}_chat_${Date.now()}`,
        hypothesis: `If we improve clarity on ${targetSelector}, then conversion should improve because current issue cluster is ${problemTag}.`,
        target_page: selectedElement?.page || "/checkout",
        target_selector: targetSelector,
        variant_b_changes: [
          {
            selector: targetSelector,
            actions: [{ type: "set_text", value: "지금 주문하고 내일 받아보세요" }],
          },
          {
            type: "inject_css",
            css: `${targetSelector}{font-weight:800;box-shadow:0 0 0 3px rgba(106,169,255,0.24);}`,
          },
        ],
        primary_goal: "checkout_complete",
        expected_impact: {
          current_cvr_A: cvrA,
          current_cvr_B: cvrB,
          target_delta: 0.02,
        },
        supporting_signals: {
          top_elements: eventSummary?.top_elements?.slice(0, 3) || [],
          issue_types: issueSummary?.issue_types?.slice(0, 3) || [],
        },
      };
    },
    save_experiment_draft: async ({ siteId, draft }) =>
      experimentsService.saveDraft({
        siteId,
        key: draft.key,
        urlPrefix: draft.target_page || "/",
        traffic: { A: 50, B: 50 },
        goals: [draft.primary_goal || "checkout_complete"],
        variants: {
          A: [],
          B: Array.isArray(draft.variant_b_changes) ? draft.variant_b_changes : [],
        },
        hypothesis: draft.hypothesis,
        source: "analytics_copilot",
      }),
  };

  const commerceTools = {
    search_products: async ({ query }) => productService.searchProducts(query),
    get_product_detail: async ({ productId }) => productService.getProductDetail(productId),
    faq_search: async ({ query }) => faqService.faqSearch(query),
    get_order_status: async ({ orderId, userId }) => orderService.getOrderStatus({ orderId, userId }),
    check_order_action_eligibility: async ({ order, actionType }) =>
      orderService.checkOrderActionEligibility({ order, actionType }),
    create_support_ticket: async (args) => supportService.createSupportTicket(args),
    draft_refund_request: async ({ order, reason, userId, actionType }) =>
      supportService.draftRefundRequest({ order, reason, userId, actionType }),
    handoff_to_human: async ({ userId, reason, context }) =>
      supportService.handoffToHuman({ userId, reason, context }),
  };

  return {
    analyticsTools,
    commerceTools,
  };
}

module.exports = { createToolRegistry };
