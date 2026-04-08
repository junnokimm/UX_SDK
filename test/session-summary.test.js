const test = require("node:test");
const assert = require("node:assert/strict");

const { summarizeSession } = require("../analytics/sessionSummary");

test("session summary counts canonical explicit commerce events", () => {
  const base = {
    site_id: "legend-ecommerce",
    anon_user_id: "u_test",
    session_id: "s_test",
    path: "/product/1",
    props: {},
  };

  const summary = summarizeSession({
    anon_user_id: "u_test",
    session_id: "s_test",
    events: [
      { ...base, ts: 1000, event_name: "page_view" },
      { ...base, ts: 1100, event_name: "add_to_cart", props: { element_id: "product_add_to_cart" } },
      { ...base, ts: 1200, event_name: "checkout_start", path: "/checkout", props: { element_id: "cart_checkout" } },
      { ...base, ts: 1300, event_name: "payment_attempt", path: "/checkout", props: { element_id: "pay_btn" } },
      { ...base, ts: 1400, event_name: "checkout_complete", path: "/order-complete" },
    ],
  });

  assert.equal(summary.page_views, 1);
  assert.equal(summary.cart_add_count, 1);
  assert.equal(summary.payment_attempt_count, 1);
  assert.equal(summary.checkout_entered, true);
  assert.equal(summary.checkout_complete, true);
  assert.equal(summary.max_step, "payment");
});
