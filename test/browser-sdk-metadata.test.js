const test = require("node:test");
const assert = require("node:assert/strict");

test("browser sdk attaches richer experiment metadata to emitted events", async () => {
  const original = {
    localStorage: global.localStorage,
    sessionStorage: global.sessionStorage,
    document: global.document,
    location: global.location,
    navigator: global.navigator,
    window: global.window,
    screen: global.screen,
    fetch: global.fetch,
    MutationObserver: global.MutationObserver,
    Blob: global.Blob,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    console: global.console,
  };

  const store = new Map();
  const storage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  };

  const listeners = new Map();
  const doc = {
    referrer: "",
    title: "Checkout",
    visibilityState: "visible",
    documentElement: {
      appendChild() {},
      setAttribute() {},
    },
    createElement() {
      return { id: "", textContent: "" };
    },
    getElementById() { return null; },
    querySelectorAll() { return []; },
    addEventListener(name, handler) { listeners.set(name, handler); },
  };

  const win = {
    innerWidth: 1280,
    innerHeight: 720,
    screen: { width: 1920, height: 1080 },
    addEventListener() {},
  };

  const fetchCalls = [];
  global.localStorage = storage;
  global.sessionStorage = storage;
  global.document = doc;
  global.location = { href: "http://localhost:8080/checkout", pathname: "/checkout", search: "" };
  global.navigator = { userAgent: "node-test", language: "ko-KR" };
  global.window = win;
  global.screen = win.screen;
  global.MutationObserver = class { observe() {} disconnect() {} };
  global.Blob = class { constructor(parts) { this.parts = parts; } };
  global.setInterval = () => 1;
  global.clearInterval = () => {};
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    if (String(url).includes("/api/config")) {
      return {
        async json() {
          return {
            ok: true,
            pathname: "/checkout",
            experiments: [{
              key: "exp_checkout_cta_v1",
              url_prefix: "/checkout",
              traffic: { A: 50, B: 50 },
              goals: ["checkout_complete"],
              variants: { A: [], B: [] },
              version: 3,
            }],
          };
        },
      };
    }
    return { async json() { return { ok: true }; } };
  };

  const sdkApi = require("../packages/browser-sdk/src/sdk.js");
  const sdk = sdkApi.createSdk({
    siteId: "legend-ecommerce",
    appId: "legend-ecommerce",
    endpoint: "/collect",
    configEndpoint: "/api/config",
    flushIntervalMs: 999999,
    maxBatchSize: 20,
  });

  try {
    sdk.install();
    await new Promise((resolve) => setTimeout(resolve, 0));
    sdk.flush();

    const collectCalls = fetchCalls.filter((call) => String(call.url).includes("/collect"));
    assert.ok(collectCalls.length >= 1, "expected collect calls");

    const events = collectCalls.flatMap((call) => JSON.parse(call.options.body).events || []);
    const pageView = events.find((event) => event.event_name === "page_view");
    const applied = events.find((event) => event.event_name === "ab_config_applied");
    assert.ok(pageView);
    assert.ok(applied);
    assert.equal(pageView.experiment_goals[0], "checkout_complete");
    assert.equal(pageView.experiments[0].key, "exp_checkout_cta_v1");
    assert.equal(pageView.experiments[0].variant === "A" || pageView.experiments[0].variant === "B", true);
    assert.deepEqual(applied.props.experiments[0].goals, ["checkout_complete"]);
  } finally {
    global.localStorage = original.localStorage;
    global.sessionStorage = original.sessionStorage;
    global.document = original.document;
    global.location = original.location;
    global.navigator = original.navigator;
    global.window = original.window;
    global.screen = original.screen;
    global.fetch = original.fetch;
    global.MutationObserver = original.MutationObserver;
    global.Blob = original.Blob;
    global.setInterval = original.setInterval;
    global.clearInterval = original.clearInterval;
    global.console = original.console;
  }
});
