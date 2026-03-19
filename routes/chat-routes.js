const express = require("express");
const { createExperimentsService } = require("../services/analytics/experiments-service");
const { createMetricsService } = require("../services/analytics/metrics-service");
const { createEventsService } = require("../services/analytics/events-service");
const { createConversationAnalyticsService } = require("../services/analytics/conversation-analytics-service");
const { createProductService } = require("../services/commerce/product-service");
const { createFaqService } = require("../services/commerce/faq-service");
const { createOrderService } = require("../services/commerce/order-service");
const { createSupportService } = require("../services/commerce/support-service");
const { createToolRegistry } = require("../services/chat/tool-registry");
const { createChatOrchestrator } = require("../services/chat/chat-orchestrator");
const { createLlmClient } = require("../services/llm");

function createChatRoutes({ files }) {
  const router = express.Router();

  const experimentsService = createExperimentsService({ experimentsFile: files.experimentsFile });
  const metricsService = createMetricsService({
    experimentsFile: files.experimentsFile,
    eventsFile: files.eventsFile,
  });
  const eventsService = createEventsService({ eventsFile: files.eventsFile });
  const conversationAnalyticsService = createConversationAnalyticsService({
    chatEventsFile: files.chatEventsFile,
    chatSessionsFile: files.chatSessionsFile,
    chatFeedbackFile: files.chatFeedbackFile,
  });
  const productService = createProductService({ productsFile: files.productsFile });
  const faqService = createFaqService({ faqFile: files.faqFile, policiesFile: files.policiesFile });
  const orderService = createOrderService({ ordersFile: files.ordersFile });
  const supportService = createSupportService({ supportTicketsFile: files.supportTicketsFile });

  const toolRegistry = createToolRegistry({
    experimentsService,
    metricsService,
    eventsService,
    conversationAnalyticsService,
    productService,
    faqService,
    orderService,
    supportService,
  });
  const llmClient = createLlmClient();
  const chatOrchestrator = createChatOrchestrator({ toolRegistry, conversationAnalyticsService, llmClient });

  router.post("/chat", async (req, res) => {
    const { agent, messages, context } = req.body || {};
    const result = await chatOrchestrator.handleChat({ agent, messages, context });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/event-summary", (req, res) => {
    const siteId = String(req.query.site_id || "ab-sample");
    const page = req.query.page ? String(req.query.page) : null;
    return res.json(eventsService.getEventSummary({ siteId, page }));
  });

  router.get("/chat-issues-summary", (req, res) => {
    const page = req.query.page ? String(req.query.page) : null;
    const productId = req.query.productId ? String(req.query.productId) : null;
    return res.json(conversationAnalyticsService.getChatIssueSummary({ page, productId }));
  });

  router.post("/experiments/draft", (req, res) => {
    const body = req.body || {};
    if (!body.key || !body.url_prefix) {
      return res.status(400).json({ ok: false, reason: "missing key/url_prefix" });
    }
    const draft = experimentsService.saveDraft({
      siteId: body.site_id || "ab-sample",
      key: body.key,
      urlPrefix: body.url_prefix,
      traffic: body.traffic,
      goals: body.goals,
      variants: body.variants,
      hypothesis: body.hypothesis,
      source: body.source || "api",
    });
    return res.json({ ok: true, experiment: draft });
  });

  router.post("/chat/feedback", (req, res) => {
    const payload = req.body || {};
    if (!payload.sessionId || !payload.agent) {
      return res.status(400).json({ ok: false, reason: "missing sessionId/agent" });
    }
    conversationAnalyticsService.saveFeedback(payload);
    return res.json({ ok: true });
  });

  router.get("/products", (req, res) => {
    const q = req.query.q ? String(req.query.q) : "";
    const list = q ? productService.searchProducts(q) : productService.listProducts();
    return res.json({ ok: true, products: list });
  });

  router.get("/faq", (req, res) => {
    const q = req.query.q ? String(req.query.q) : "";
    const list = q ? faqService.faqSearch(q) : faqService.listFaq();
    return res.json({ ok: true, items: list });
  });

  router.get("/orders/:id", (req, res) => {
    const id = req.params.id;
    const userId = req.query.userId ? String(req.query.userId) : null;
    const order = orderService.getOrderStatus({ orderId: id, userId });
    if (!order) return res.status(404).json({ ok: false, reason: "order not found" });
    return res.json({ ok: true, order });
  });

  return router;
}

module.exports = { createChatRoutes };
