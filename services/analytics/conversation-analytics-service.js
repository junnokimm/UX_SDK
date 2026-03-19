const { appendJsonl, readJson, readJsonl, writeJson } = require("../data-store");

function createConversationAnalyticsService({ chatEventsFile, chatSessionsFile, chatFeedbackFile }) {
  function logChatEvent(event) {
    const normalized = {
      sessionId: event.sessionId,
      timestamp: event.timestamp || Date.now(),
      agent: event.agent,
      role: event.role || "assistant",
      page: event.page || null,
      productId: event.productId || null,
      userId: event.userId || null,
      orderId: event.orderId || null,
      detectedIntent: event.detectedIntent || event.issueType || "general",
      resolved: typeof event.resolved === "boolean" ? event.resolved : !event.unresolved,
      unresolved: !!event.unresolved,
      fallback: !!event.fallback,
      handedOffToHuman: !!event.handedOffToHuman,
      relatedExperimentKey: event.relatedExperimentKey || null,
      content: event.content || "",
      metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {},
    };

    appendJsonl(chatEventsFile, normalized);

    const sessionsDb = readJson(chatSessionsFile, { sessions: [] }) || { sessions: [] };
    const idx = sessionsDb.sessions.findIndex((s) => s.sessionId === normalized.sessionId && s.agent === normalized.agent);
    if (idx >= 0) {
      sessionsDb.sessions[idx].updatedAt = Date.now();
      sessionsDb.sessions[idx].messageCount = (sessionsDb.sessions[idx].messageCount || 0) + 1;
      sessionsDb.sessions[idx].lastPage = normalized.page;
      sessionsDb.sessions[idx].lastIntent = normalized.detectedIntent;
    } else {
      sessionsDb.sessions.push({
        sessionId: normalized.sessionId,
        agent: normalized.agent,
        userId: normalized.userId,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 1,
        lastPage: normalized.page,
        lastIntent: normalized.detectedIntent,
      });
    }
    writeJson(chatSessionsFile, sessionsDb);
  }

  function saveFeedback(input) {
    const db = readJson(chatFeedbackFile, { feedback: [] }) || { feedback: [] };
    db.feedback.push({
      id: `fb_${Math.random().toString(16).slice(2, 10)}`,
      created_at: Date.now(),
      ...input,
    });
    writeJson(chatFeedbackFile, db);
  }

  function getChatIssueSummary({ page, productId }) {
    const logs = readJsonl(chatEventsFile).filter((x) => x.agent === "commerce_support");
    const filtered = logs.filter((x) => {
      if (page && x.page !== page) return false;
      if (productId && x.productId !== productId) return false;
      return true;
    });

    const byType = new Map();
    const byPage = new Map();
    let unresolved = 0;
    let fallback = 0;
    let handedOff = 0;

    for (const row of filtered) {
      if (row.role !== "assistant") continue;
      if (row.unresolved) unresolved += 1;
      if (row.fallback) fallback += 1;
      if (row.handedOffToHuman) handedOff += 1;
      const key = row.detectedIntent || row.issueType || "general";
      byType.set(key, (byType.get(key) || 0) + 1);
      const pageKey = row.page || "unknown";
      byPage.set(pageKey, (byPage.get(pageKey) || 0) + 1);
    }

    return {
      ok: true,
      total_messages: filtered.length,
      unresolved_count: unresolved,
      fallback_count: fallback,
      handed_off_count: handedOff,
      issue_types: Array.from(byType.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([issueType, count]) => ({ issueType, count })),
      page_hotspots: Array.from(byPage.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([pageName, count]) => ({ page: pageName, count })),
      top_unresolved_topics: Array.from(byType.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([issueType, count]) => ({ issueType, count })),
    };
  }

  return {
    logChatEvent,
    saveFeedback,
    getChatIssueSummary,
  };
}

module.exports = { createConversationAnalyticsService };
