const { readJson } = require("../data-store");

function createOrderService({ ordersFile }) {
  function listOrders() {
    const db = readJson(ordersFile, { orders: [] }) || { orders: [] };
    return db.orders;
  }

  function getOrderStatus({ orderId, userId }) {
    const orders = listOrders();
    if (orderId) {
      const exact = orders.find((o) => o.id === orderId);
      if (!exact) return null;
      if (userId && exact.userId !== userId) return null;
      return exact;
    }
    if (userId) {
      return orders
        .filter((o) => o.userId === userId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
    }
    return null;
  }

  function checkOrderActionEligibility({ order, actionType }) {
    if (!order) {
      return { eligible: false, reason: "order_not_found" };
    }

    const now = Date.now();
    const deliveredAt = Number(order.deliveredAt || 0);
    const shippedAt = Number(order.shippedAt || 0);
    const createdAt = Number(order.createdAt || 0);
    const requestState = String(order.requestState || "none");

    const withinDays = (ts, days) => {
      if (!ts) return false;
      return now - ts <= days * 24 * 60 * 60 * 1000;
    };

    const shipped = ["shipped", "in_transit", "delivered"].includes(order.status);
    const delivered = order.status === "delivered";
    const cancelled = order.status === "cancelled";
    const terminal = ["cancelled", "refunded", "returned"].includes(order.status);

    if (["cancel_pending", "refund_pending", "exchange_pending"].includes(requestState)) {
      return { eligible: false, reason: "request_already_in_progress" };
    }

    if (terminal || cancelled) {
      return { eligible: false, reason: "order_already_closed" };
    }

    if (actionType === "cancel") {
      if (shipped || shippedAt) return { eligible: false, reason: "already_shipped" };
      if (!createdAt) return { eligible: true, reason: "before_shipment" };
      const withinCancelWindow = withinDays(createdAt, 1);
      return withinCancelWindow
        ? { eligible: true, reason: "before_shipment_within_24h" }
        : { eligible: false, reason: "cancel_window_expired" };
    }

    if (actionType === "refund") {
      if (!delivered) return { eligible: false, reason: "refund_requires_delivery" };
      const withinRefundWindow = withinDays(deliveredAt, 7);
      return withinRefundWindow
        ? { eligible: true, reason: "within_refund_window_7d" }
        : { eligible: false, reason: "refund_window_expired" };
    }

    if (actionType === "exchange") {
      if (!delivered) return { eligible: false, reason: "exchange_requires_delivery" };
      const withinExchangeWindow = withinDays(deliveredAt, 7);
      return withinExchangeWindow
        ? { eligible: true, reason: "within_exchange_window_7d" }
        : { eligible: false, reason: "exchange_window_expired" };
    }

    return { eligible: false, reason: "unsupported_action" };
  }

  return {
    listOrders,
    getOrderStatus,
    checkOrderActionEligibility,
  };
}

module.exports = { createOrderService };
