const { readJson, writeJson } = require("../data-store");

function createSupportService({ supportTicketsFile }) {
  function loadDb() {
    return readJson(supportTicketsFile, { tickets: [] }) || { tickets: [] };
  }

  function createSupportTicket({ userId, orderId, category, message, priority, source }) {
    const db = loadDb();
    const ticket = {
      id: `ticket_${Math.random().toString(16).slice(2, 10)}`,
      userId: userId || "guest",
      orderId: orderId || null,
      category: category || "general",
      message: message || "",
      priority: priority || "normal",
      source: source || "commerce_support",
      status: "open",
      createdAt: Date.now(),
    };
    db.tickets.push(ticket);
    writeJson(supportTicketsFile, db);
    return ticket;
  }

  function draftRefundRequest({ order, reason, userId, actionType }) {
    const normalized = ["refund", "cancel", "exchange"].includes(actionType) ? actionType : "refund";
    return {
      draftId: `draft_refund_${Math.random().toString(16).slice(2, 10)}`,
      type: `${normalized}_request_draft`,
      status: "draft",
      userId: userId || order?.userId || "guest",
      orderId: order?.id || null,
      reason: reason || "unspecified",
      createdAt: Date.now(),
      note: "This is a draft only. Human review required before execution.",
    };
  }

  function handoffToHuman({ userId, reason, context }) {
    const ticket = createSupportTicket({
      userId,
      category: "handoff",
      message: reason || "User requested human support.",
      priority: "high",
      source: "handoff_to_human",
    });

    return {
      handoff: true,
      ticketId: ticket.id,
      queue: "support_level_1",
      context: context || {},
    };
  }

  return {
    createSupportTicket,
    draftRefundRequest,
    handoffToHuman,
  };
}

module.exports = { createSupportService };
