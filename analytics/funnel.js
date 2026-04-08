// analytics/funnel.js

const STEPS = [
  "home",
  "browse",
  "product",
  "cart",
  "checkout",
  "payment"
];

function stepIndex(step) {
  const i = STEPS.indexOf(step);
  return i >= 0 ? i : 0;
}

function inferStepFromPath(pathname) {
  const p = String(pathname || "");
  if (p === "/" || p.startsWith("/home")) return "home";
  if (p.startsWith("/category") || p.startsWith("/search")) return "browse";
  if (p.startsWith("/detail") || p.startsWith("/product")) return "product";
  if (p.startsWith("/cart")) return "cart";
  if (p.startsWith("/checkout")) return "checkout";
  return "browse";
}

function inferStepFromEvent(e) {
  if (!e) return "browse";
  if (e.event_name === "checkout_complete") return "payment";
  if (e.event_name === "checkout_start") return "checkout";
  if (e.event_name === "payment_attempt") return "payment";
  if (e.event_name === "add_to_cart" || e.event_name === "remove_from_cart") return "cart";

  if (e.event_name === "page_view") return inferStepFromPath(e.path);

  const props = e.props || {};
  const elid = typeof props.element_id === "string" ? props.element_id : "";
  if (elid.includes("pay") || elid.includes("payment")) return "payment";
  if (elid.includes("checkout")) return "checkout";
  if (elid.includes("cart")) return "cart";
  if (elid.includes("detail") || elid.includes("product")) return "product";

  return inferStepFromPath(e.path);
}

function maxStep(steps) {
  let m = "home";
  for (const s of steps || []) {
    if (stepIndex(s) > stepIndex(m)) m = s;
  }
  return m;
}

module.exports = {
  STEPS,
  inferStepFromEvent,
  inferStepFromPath,
  maxStep,
  stepIndex
};
