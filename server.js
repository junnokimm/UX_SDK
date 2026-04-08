// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { ensureJsonFile, ensureJsonlFile } = require("./services/data-store");
const { createChatRoutes } = require("./routes/chat-routes");
const { loadEnvFromFile } = require("./services/llm/config");
const {
  createFileEventStore,
  createCompositeEventStore,
  createKafkaEventStore,
} = require("./services/stores/event-store");
const { createFileExperimentStore } = require("./services/stores/experiment-store");
const { createFileSiteRegistryStore } = require("./services/stores/site-registry-store");
const { createMetricsReadModel } = require("./services/read-models/metrics-read-model");
const { getInfraConfig } = require("./services/runtime/infra-config");
const { createKafkaRuntime } = require("./services/runtime/kafka");
const { createRedisRuntime } = require("./services/runtime/redis");
const { createRedisSessionStore } = require("./services/stores/redis-session-store");

const {
  computeLabeledSessionSummaries,
  computeLabelsSummary,
  buildInsightsInput
} = require("./analytics/pipeline");
const { generateInsights } = require("./insights/generator");
const {
  VALID_EXPERIMENT_STATUSES,
  normalizeExperimentStatus,
  canTransitionExperimentStatus,
} = require("./services/analytics/experiment-status");

loadEnvFromFile();
const infraConfig = getInfraConfig();

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
});

app.use((req, res, next) => {
  const noStorePaths = [
    "/editor",
    "/dashboard",
    "/editor.js",
    "/dashboard.js",
    "/analytics-chat.js",
    "/api/sites",
  ];
  if (noStorePaths.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`)) || req.path.startsWith("/preview/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  return next();
});

app.use(express.json({ limit: "5mb" }));
const SDK_PACKAGE_DIR = path.join(__dirname, "packages", "browser-sdk");
const SDK_PACKAGE_META = require(path.join(SDK_PACKAGE_DIR, "package.json"));
const SDK_PACKAGE_FILE = path.join(SDK_PACKAGE_DIR, SDK_PACKAGE_META.main);
app.get("/sdk.js", (req, res) => res.sendFile(SDK_PACKAGE_FILE));
app.use(express.static(path.join(__dirname, "public")));

// pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/detail", (req, res) => res.sendFile(path.join(__dirname, "public", "detail.html")));
app.get("/checkout", (req, res) => res.sendFile(path.join(__dirname, "public", "checkout.html")));
app.get("/editor", (req, res) => res.sendFile(path.join(__dirname, "public", "editor.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));

// data dir
const DATA_DIR = path.join(__dirname, "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");
const EXP_FILE = path.join(DATA_DIR, "experiments.json");
const SITES_FILE = path.join(DATA_DIR, "sites.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const FAQ_FILE = path.join(DATA_DIR, "faq.json");
const POLICIES_FILE = path.join(DATA_DIR, "policies.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const SUPPORT_TICKETS_FILE = path.join(DATA_DIR, "support_tickets.json");
const CHAT_SESSIONS_FILE = path.join(DATA_DIR, "chat_sessions.json");
const CHAT_EVENTS_FILE = path.join(DATA_DIR, "chat_events.jsonl");
const CHAT_FEEDBACK_FILE = path.join(DATA_DIR, "chat_feedback.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
ensureJsonFile(EXP_FILE, { experiments: [] });
ensureJsonFile(SITES_FILE, {
  sites: [
    {
      site_id: "legend-ecommerce",
      name: "Legend Ecommerce",
      preview_base_url: "http://127.0.0.1:8080",
      api_base_url: "http://127.0.0.1:3000",
      preview_targets: [
        { id: "home", label: "홈", path: "/", url_prefix: "/", default: true, experiment_key: "exp_home_cta_v1" },
        { id: "collection", label: "컬렉션", path: "/collection", url_prefix: "/collection", experiment_key: "exp_collection_cta_v1" },
        { id: "checkout", label: "체크아웃", path: "/checkout", url_prefix: "/checkout", experiment_key: "exp_checkout_cta_v1" }
      ]
    },
    {
      site_id: "ab-sample",
      name: "SDK Sample",
      preview_base_url: "http://127.0.0.1:3001",
      api_base_url: "http://127.0.0.1:3001",
      preview_targets: [
        { id: "main", label: "메인", path: "/", url_prefix: "/", default: true, experiment_key: "exp_main_cta_v1" },
        { id: "detail", label: "상세", path: "/detail?product=neo-coffee", url_prefix: "/detail", experiment_key: "exp_detail_cta_v1" },
        { id: "checkout", label: "체크아웃", path: "/checkout?product=neo-coffee", url_prefix: "/checkout", experiment_key: "exp_checkout_cta_v1" }
      ]
    }
  ]
});
ensureJsonFile(PRODUCTS_FILE, {
  products: [
    {
      id: "neo-coffee",
      name: "네오 커피",
      price: 12900,
      description: "원두 500g, 산미가 낮고 고소한 블렌드",
      specs: ["원두 500g", "로스팅: 미디엄", "산미: 낮음"],
      options: ["원두", "분쇄"],
      stock: 42,
      category: "beverage",
      tags: ["coffee", "beans", "daily"],
    },
    {
      id: "luna-tea",
      name: "루나 티",
      price: 9900,
      description: "티백 20개 구성, 깔끔한 허브 향",
      specs: ["티백 20개", "카페인: 낮음", "향: 허브"],
      options: ["기본"],
      stock: 31,
      category: "beverage",
      tags: ["tea", "herbal", "calm"],
    },
    {
      id: "aurora-mug",
      name: "오로라 머그",
      price: 15900,
      description: "세라믹 소재 350ml 머그컵",
      specs: ["용량: 350ml", "소재: 세라믹", "식기세척기 사용 가능"],
      options: ["white", "mint"],
      stock: 80,
      category: "goods",
      tags: ["mug", "kitchen", "daily"],
    },
    {
      id: "pixel-snack",
      name: "픽셀 스낵",
      price: 5900,
      description: "바삭한 식감의 스낵 8봉 세트",
      specs: ["8봉", "맛: 솔티", "보관: 실온"],
      options: ["기본"],
      stock: 120,
      category: "snack",
      tags: ["snack", "bundle", "kids"],
    },
  ],
});
ensureJsonFile(FAQ_FILE, {
  faq: [
    { id: "faq-1", topic: "shipping", question: "배송은 얼마나 걸리나요?", answer: "평균 1-3영업일 소요됩니다." },
    { id: "faq-2", topic: "refund", question: "환불은 언제 가능하나요?", answer: "수령 후 7일 이내 신청 가능합니다." },
    { id: "faq-3", topic: "exchange", question: "교환이 가능한가요?", answer: "재고가 있으면 1회 교환 가능합니다." },
    { id: "faq-4", topic: "payment", question: "어떤 결제 수단을 지원하나요?", answer: "카드, 계좌이체, 간편결제를 지원합니다." },
  ],
});
ensureJsonFile(POLICIES_FILE, {
  policies: [
    { id: "pol-1", topic: "refund", title: "환불 정책", answer: "사용 흔적이 없는 상품은 수령 후 7일 이내 환불 가능합니다." },
    { id: "pol-2", topic: "exchange", title: "교환 정책", answer: "옵션 교환은 재고 유무 확인 후 진행되며 왕복 배송비가 발생할 수 있습니다." },
    { id: "pol-3", topic: "shipping", title: "배송 정책", answer: "도서산간 지역은 추가 배송비가 적용될 수 있습니다." },
    { id: "pol-4", topic: "coupon", title: "쿠폰 정책", answer: "쿠폰은 일부 상품/기간에 따라 중복 적용이 제한될 수 있습니다." },
  ],
});
ensureJsonFile(ORDERS_FILE, {
  orders: [
    {
      id: "ORD-1001",
      userId: "guest-123",
      items: [{ productId: "neo-coffee", qty: 1 }],
      status: "delivered",
      totalAmount: 12900,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      shippedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      deliveredAt: Date.now() - 1000 * 60 * 60 * 24,
      requestState: "none",
    },
    {
      id: "ORD-1002",
      userId: "guest-123",
      items: [{ productId: "luna-tea", qty: 1 }],
      status: "processing",
      totalAmount: 9900,
      createdAt: Date.now() - 1000 * 60 * 60 * 6,
      requestState: "none",
    },
    {
      id: "ORD-1003",
      userId: "guest-999",
      items: [{ productId: "aurora-mug", qty: 2 }],
      status: "shipped",
      totalAmount: 31800,
      createdAt: Date.now() - 1000 * 60 * 60 * 12,
      shippedAt: Date.now() - 1000 * 60 * 60 * 4,
      requestState: "none",
    },
  ],
});
ensureJsonFile(SUPPORT_TICKETS_FILE, { tickets: [] });
ensureJsonFile(CHAT_SESSIONS_FILE, { sessions: [] });
ensureJsonFile(CHAT_FEEDBACK_FILE, { feedback: [] });
ensureJsonlFile(CHAT_EVENTS_FILE);

// ---------- utils ----------
function now() { return Date.now(); }
function rid() { return crypto.randomBytes(8).toString("hex"); }
function safeAbsoluteUrl(baseUrl, value) {
  try {
    return new URL(value || "/", baseUrl).toString();
  } catch {
    return new URL("/", baseUrl).toString();
  }
}
const fileEventStore = createFileEventStore({ eventsFile: EVENTS_FILE });
const experimentStore = createFileExperimentStore({ experimentsFile: EXP_FILE });
const siteRegistryStore = createFileSiteRegistryStore({ sitesFile: SITES_FILE });
const metricsReadModel = createMetricsReadModel({ eventStore: fileEventStore, experimentStore });

const kafkaRuntime = infraConfig.kafka.enabled
  ? createKafkaRuntime({ brokers: infraConfig.kafka.brokers, clientId: infraConfig.kafka.clientId })
  : null;
const redisRuntime = infraConfig.redis.enabled
  ? createRedisRuntime({ url: infraConfig.redis.url, keyPrefix: infraConfig.redis.keyPrefix })
  : null;
const redisSessionStore = redisRuntime
  ? createRedisSessionStore({
      redisRuntime,
      sessionTtlSec: infraConfig.redis.sessionTtlSec,
      assignmentTtlSec: infraConfig.redis.assignmentTtlSec,
    })
  : null;
const eventStore = kafkaRuntime
  ? createCompositeEventStore({
      primaryStore: fileEventStore,
      secondaryStores: [createKafkaEventStore({ kafkaRuntime, topic: infraConfig.kafka.topicEvents })],
      logger: (...args) => console.warn("[infra]", ...args),
    })
  : fileEventStore;
function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "page";
}
function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function buildExperimentKeyForPath(pathname) {
  const clean = String(pathname || "/").split("?")[0] || "/";
  if (clean === "/") return "exp_home_cta_v1";
  const parts = clean.split("/").filter(Boolean).map(slugify).filter(Boolean);
  return `exp_${parts.join("_") || "page"}_cta_v1`;
}
function inferTargetType(pathname) {
  const path = String(pathname || "/").toLowerCase();
  if (path === "/") return "home";
  if (path.includes("checkout")) return "checkout";
  if (path.includes("cart")) return "cart";
  if (path.includes("product")) return "product";
  if (path.includes("shop")) return "shop";
  if (path.includes("collection")) return "collection";
  if (path.includes("order-complete")) return "order-complete";
  if (path.includes("login")) return "login";
  if (path.includes("join") || path.includes("signup")) return "join";
  return slugify(path.split("/").filter(Boolean)[0] || "page");
}
function scoreCandidatePath(pathname) {
  const type = inferTargetType(pathname);
  const table = {
    home: 100,
    checkout: 95,
    cart: 92,
    product: 90,
    shop: 88,
    collection: 82,
    "order-complete": 55,
    login: 25,
    join: 25,
  };
  return table[type] || 40;
}
function labelForCandidate(pathname, hint) {
  const type = inferTargetType(pathname);
  const table = {
    home: "홈",
    checkout: "체크아웃",
    cart: "장바구니",
    product: "상품상세",
    shop: "샵",
    collection: "컬렉션",
    "order-complete": "주문완료",
    login: "로그인",
    join: "회원가입",
  };
  if (table[type]) return table[type];
  const hinted = String(hint || "").trim();
  if (hinted && hinted.length <= 40) return hinted;
  return String(pathname || "/");
}
function targetIdForPath(pathname) {
  const type = inferTargetType(pathname);
  if (type === "home") return "home";
  const path = String(pathname || "/").split("?")[0];
  const tail = path.split("/").filter(Boolean).slice(1).join("-");
  return tail ? `${type}-${slugify(tail)}` : type;
}
function matchesPattern(pathname, pattern) {
  if (!pattern) return false;
  const value = String(pathname || "");
  const source = String(pattern || "").trim();
  if (!source) return false;
  if (source.startsWith("/") && source.endsWith("/")) {
    try { return new RegExp(source.slice(1, -1)).test(value); } catch { return false; }
  }
  return value.includes(source);
}
function normalizeDiscoverablePath(baseUrl, href) {
  const raw = String(href || "").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return null;
  try {
    const base = new URL(baseUrl);
    const url = new URL(raw, base);
    if (url.origin !== base.origin) return null;
    if (!/^https?:$/.test(url.protocol)) return null;
    const pathname = url.pathname || "/";
    if (/\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map)$/i.test(pathname)) return null;
    return `${pathname}${url.search}` || "/";
  } catch {
    return null;
  }
}
function extractHtmlTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(stripHtml(match[1])) : "";
}
function extractAnchorCandidates(html, baseUrl) {
  const source = String(html || "");
  const candidates = [];
  const regex = /<a\b[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(source))) {
    const path = normalizeDiscoverablePath(baseUrl, match[2]);
    if (!path) continue;
    candidates.push({
      path,
      text: decodeHtml(stripHtml(match[3]))
    });
  }
  return candidates;
}
async function fetchHtmlDocument(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "ux-sdk-target-inference",
    },
  });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !/text\/html/i.test(contentType)) {
    return null;
  }
  return response.text();
}
async function inferPreviewTargets(site) {
  const generation = site?.target_generation || {};
  const baseUrl = String(site?.preview_base_url || "").trim();
  if (!baseUrl) return [];

  const includePatterns = Array.isArray(generation.include_patterns) ? generation.include_patterns : [];
  const excludePatterns = Array.isArray(generation.exclude_patterns) ? generation.exclude_patterns : [];
  const maxTargets = Math.max(1, Math.min(Number(generation.max_targets) || 6, 12));
  const maxPagesToScan = Math.max(1, Math.min(Number(generation.max_pages_to_scan) || 6, 12));
  const seedPaths = Array.from(new Set(["/", ...((Array.isArray(generation.seed_paths) ? generation.seed_paths : []))]
    .map((path) => normalizeDiscoverablePath(baseUrl, path))
    .filter(Boolean)));

  const queue = [...seedPaths];
  const visitedPages = new Set();
  const candidates = new Map();

  while (queue.length && visitedPages.size < maxPagesToScan) {
    const currentPath = queue.shift();
    if (!currentPath || visitedPages.has(currentPath)) continue;
    visitedPages.add(currentPath);

    try {
      const html = await fetchHtmlDocument(safeAbsoluteUrl(baseUrl, currentPath));
      if (!html) continue;

      const title = extractHtmlTitle(html);
      const currentKey = currentPath.split("?")[0] || "/";
      if (!excludePatterns.some((pattern) => matchesPattern(currentKey, pattern))) {
        candidates.set(currentPath, {
          path: currentPath,
          labelHint: title,
        });
      }

      const anchors = extractAnchorCandidates(html, baseUrl);
      for (const anchor of anchors) {
        const key = anchor.path.split("?")[0] || "/";
        if (excludePatterns.some((pattern) => matchesPattern(key, pattern))) continue;
        if (includePatterns.length > 0 && !includePatterns.some((pattern) => matchesPattern(key, pattern))) continue;
        if (!candidates.has(anchor.path)) {
          candidates.set(anchor.path, {
            path: anchor.path,
            labelHint: anchor.text || title,
          });
        }
        if (!visitedPages.has(anchor.path) && queue.length < maxPagesToScan * 3) {
          queue.push(anchor.path);
        }
      }
    } catch {
      continue;
    }
  }

  const discoveredAt = Date.now();
  const normalized = Array.from(candidates.values())
    .map((candidate) => {
      const pathname = candidate.path.split("?")[0] || "/";
      return {
        id: targetIdForPath(pathname),
        label: labelForCandidate(pathname, candidate.labelHint),
        path: candidate.path,
        url_prefix: pathname,
        default: pathname === "/",
        experiment_key: buildExperimentKeyForPath(pathname),
        origin: "inferred",
        confidence: scoreCandidatePath(pathname),
        last_discovered_at: discoveredAt,
      };
    })
    .sort((a, b) => (b.confidence - a.confidence) || a.path.localeCompare(b.path));

  const byId = new Map();
  for (const target of normalized) {
    if (!byId.has(target.id)) byId.set(target.id, target);
  }

  const result = Array.from(byId.values()).slice(0, maxTargets);
  if (!result.some((target) => target.default)) {
    const home = result.find((target) => target.url_prefix === "/");
    if (home) home.default = true;
    else if (result[0]) result[0].default = true;
  }
  return result;
}
function mergePreviewTargets(manualTargets, inferredTargets) {
  const merged = [];
  const seen = new Set();
  const append = (target) => {
    if (!target) return;
    const key = `${String(target.id || "").trim()}::${String(target.path || "").trim()}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(target);
  };

  inferredTargets.forEach(append);
  manualTargets.forEach(append);
  return merged;
}
function normalizeSite(site) {
  if (!site || typeof site !== "object") return null;

  const site_id = String(site.site_id || "").trim();
  const preview_base_url = String(site.preview_base_url || "").trim();
  if (!site_id || !preview_base_url) return null;

  const api_base_url = String(site.api_base_url || preview_base_url).trim();
  const target_generation = site.target_generation || { mode: "manual" };
  const manualTargets = Array.isArray(site.preview_targets) ? site.preview_targets : [];
  const inferredTargets = Array.isArray(site.inferred_preview_targets) ? site.inferred_preview_targets : [];
  const rawTargets = target_generation.mode === "inferred"
    ? (inferredTargets.length ? inferredTargets : manualTargets)
    : target_generation.mode === "hybrid"
      ? mergePreviewTargets(manualTargets, inferredTargets)
      : manualTargets;
  const hasExplicitDefault = rawTargets.some((target) => Boolean(target?.default));
  const preview_targets = rawTargets.map((target, index) => {
    const id = String(target?.id || `target-${index + 1}`).trim() || `target-${index + 1}`;
    const pathValue = String(target?.path || "/").trim() || "/";
    const label = String(target?.label || pathValue).trim() || pathValue;
    const liveUrl = safeAbsoluteUrl(preview_base_url, pathValue);
    const parsed = new URL(liveUrl);
    const url_prefix = String(target?.url_prefix || parsed.pathname || "/").trim() || "/";
    return {
      id,
      label,
      path: pathValue,
      url_prefix,
      default: hasExplicitDefault ? Boolean(target?.default) : index === 0,
      experiment_key: String(target?.experiment_key || "").trim() || null,
      origin: String(target?.origin || (Array.isArray(site.inferred_preview_targets) && site.inferred_preview_targets.includes(target) ? "inferred" : "manual")).trim() || "manual",
      confidence: Number.isFinite(Number(target?.confidence)) ? Number(target.confidence) : null,
      last_discovered_at: Number.isFinite(Number(target?.last_discovered_at)) ? Number(target.last_discovered_at) : null,
      live_url: liveUrl,
      preview_url: `/preview/${encodeURIComponent(site_id)}${parsed.pathname}${parsed.search}`,
    };
  });

  return {
    site_id,
    name: String(site.name || site_id).trim() || site_id,
    preview_base_url,
    api_base_url,
    target_generation,
    inferred_targets_updated_at: Number.isFinite(Number(site.inferred_targets_updated_at)) ? Number(site.inferred_targets_updated_at) : null,
    preview_targets,
  };
}
function listSites() {
  return siteRegistryStore.listRaw().map(normalizeSite).filter(Boolean);
}
function getSiteById(siteId) {
  return listSites().find((site) => site.site_id === siteId) || null;
}
function shouldRefreshInferredTargets(site) {
  const generation = site?.target_generation || {};
  if (!generation || generation.mode === "manual") return false;
  const ttlSec = Math.max(0, Number(generation.refresh_ttl_sec) || 0);
  const updatedAt = Number(site?.inferred_targets_updated_at) || 0;
  const inferredTargets = Array.isArray(site?.inferred_preview_targets) ? site.inferred_preview_targets : [];
  if (inferredTargets.length === 0) return true;
  if (ttlSec <= 0) return false;
  return (Date.now() - updatedAt) > ttlSec * 1000;
}
async function ensureSiteInference(siteId, options) {
  const force = Boolean(options?.force);
  const rawSite = siteRegistryStore.getRawById(siteId);
  if (!rawSite) return null;
  if (!rawSite?.target_generation || rawSite.target_generation.mode === "manual") {
    return normalizeSite(rawSite);
  }

  if (!force && !shouldRefreshInferredTargets(rawSite)) {
    return normalizeSite(rawSite);
  }

  const inferredTargets = await inferPreviewTargets(rawSite);
  const next = siteRegistryStore.patchRawById(siteId, (current) => ({
    ...current,
    inferred_preview_targets: inferredTargets,
    inferred_targets_updated_at: Date.now(),
  }));
  return normalizeSite(next);
}
async function listSitesForApi() {
  const sites = [];
  for (const site of siteRegistryStore.listRaw()) {
    const siteId = String(site?.site_id || "").trim();
    if (!siteId) continue;
    const normalized = await ensureSiteInference(siteId, { force: false });
    if (normalized) sites.push(normalized);
  }
  return sites;
}
function buildPreviewBootstrap(site, previewPath) {
  const proxyApiBaseUrl = JSON.stringify(`/preview-api/${encodeURIComponent(site.site_id)}`);
  const initialPath = JSON.stringify(previewPath || "/");
  return `<script>\n(function(){\n  var API_BASE_URL = ${proxyApiBaseUrl};\n  var INITIAL_PATH = ${initialPath};\n  try { history.replaceState({}, '', INITIAL_PATH); } catch (e) {}\n  var originalFetch = window.fetch ? window.fetch.bind(window) : null;\n  function mapUrl(input){\n    try {\n      if (typeof input === 'string' && input.indexOf('/api/') === 0) return API_BASE_URL + input;\n      if (input instanceof Request) {\n        var reqUrl = new URL(input.url, location.href);\n        if (reqUrl.origin === location.origin && reqUrl.pathname.indexOf('/api/') === 0) return API_BASE_URL + reqUrl.pathname + reqUrl.search;\n      }\n    } catch (e) {}\n    return input;\n  }\n  if (originalFetch) {\n    window.fetch = function(input, init){\n      var mapped = mapUrl(input);\n      if (input instanceof Request && typeof mapped === 'string') {\n        return originalFetch(new Request(mapped, input), init);\n      }\n      return originalFetch(mapped, init);\n    };\n  }\n  var originalOpen = XMLHttpRequest.prototype.open;\n  XMLHttpRequest.prototype.open = function(method, url){\n    if (typeof url === 'string' && url.indexOf('/api/') === 0) {\n      url = API_BASE_URL + url;\n    }\n    return originalOpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));\n  };\n})();\n</script>`;
}
function rewritePreviewText(site, text, contentType, previewPath) {
  const siteId = encodeURIComponent(site.site_id);
  const assetPrefix = `/preview/${siteId}`;
  let out = text;

  if (/text\/html/i.test(contentType)) {
    out = out
      .replace(/(href|src|action)=(["'])\/(?!\/)/g, `$1=$2${assetPrefix}/`)
      .replace(/(["'`])\/@react-refresh(["'`])/g, `$1${assetPrefix}/@react-refresh$2`)
      .replace(/(["'`])\/(\@react-refresh|\@vite|assets|src|node_modules)\//g, `$1${assetPrefix}/$2/`)
      .replace(/<head([^>]*)>/i, `<head$1>${buildPreviewBootstrap(site, previewPath)}`);
  }

  if (/javascript|ecmascript|css/i.test(contentType)) {
    out = out
      .replace(/(["'`])\/@react-refresh(["'`])/g, `$1${assetPrefix}/@react-refresh$2`)
      .replace(/(["'`])\/(assets|src|@react-refresh|@vite|node_modules)\//g, `$1${assetPrefix}/$2/`);
  }

  if (/css/i.test(contentType)) {
    out = out.replace(/url\((["']?)\/(assets|src|node_modules)\//g, `url($1${assetPrefix}/$2/`);
  }

  return out;
}
function safeParseJsonLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function toInt(x) {
  const n = Math.trunc(Number(x));
  return Number.isFinite(n) ? n : null;
}

// ---------- collect endpoint ----------
app.post("/collect", async (req, res) => {
  const payload = req.body;
  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (events.length === 0) return res.status(400).json({ ok: false, reason: "no events" });

  try {
    await eventStore.appendBatch(events, { received_at: Date.now(), request_id: rid() });
    console.log("✅ collect:", events[events.length - 1]?.event_name, "count=", events.length);
    return res.json({ ok: true, received: events.length });
  } catch (error) {
    return res.status(500).json({ ok: false, reason: `collect failed: ${String(error)}` });
  }
});

app.get("/api/sites", async (req, res) => {
  const sites = await listSitesForApi();
  return res.json({ ok: true, sites });
});

app.get("/api/sites/:siteId", async (req, res) => {
  const site = await ensureSiteInference(String(req.params.siteId || "").trim(), { force: false });
  if (!site) return res.status(404).json({ ok: false, reason: "site not found" });
  return res.json({ ok: true, site });
});

app.get("/api/sites/:siteId/preview-targets", async (req, res) => {
  const site = await ensureSiteInference(String(req.params.siteId || "").trim(), { force: false });
  if (!site) return res.status(404).json({ ok: false, reason: "site not found" });
  return res.json({ ok: true, site_id: site.site_id, preview_targets: site.preview_targets });
});

app.post("/api/sites/:siteId/preview-targets/refresh", async (req, res) => {
  const site = await ensureSiteInference(String(req.params.siteId || "").trim(), { force: true });
  if (!site) return res.status(404).json({ ok: false, reason: "site not found" });
  return res.json({ ok: true, site_id: site.site_id, preview_targets: site.preview_targets, refreshed_at: Date.now() });
});

async function proxyPreviewRequest(req, res) {
  const siteId = String(req.params.siteId || "").trim();
  const site = getSiteById(siteId);
  if (!site) return res.status(404).send("site not found");

  const restPath = String(req.params[0] || "").trim();
  const pathWithQuery = `/${restPath}${req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""}`;
  const upstreamUrl = safeAbsoluteUrl(site.preview_base_url, pathWithQuery === "/" ? "/" : pathWithQuery);
  const previewPath = (() => {
    try {
      const parsed = new URL(upstreamUrl);
      return `${parsed.pathname}${parsed.search}` || "/";
    } catch {
      return "/";
    }
  })();

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "user-agent": req.get("user-agent") || "ux-sdk-preview-proxy",
        accept: req.get("accept") || "*/*",
      },
    });

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.status(upstream.status);
    res.setHeader("content-type", contentType);

    if (/text\/html|javascript|ecmascript|css/i.test(contentType)) {
      const text = await upstream.text();
      return res.send(rewritePreviewText(site, text, contentType, previewPath));
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    return res.status(502).send(`preview proxy failed: ${String(error)}`);
  }
}

app.get("/preview/:siteId", proxyPreviewRequest);
app.get("/preview/:siteId/*", proxyPreviewRequest);

async function proxyPreviewApiRequest(req, res) {
  const siteId = String(req.params.siteId || "").trim();
  const site = getSiteById(siteId);
  if (!site) return res.status(404).json({ ok: false, reason: "site not found" });

  const restPath = String(req.params[0] || "").trim();
  const search = req.url.includes("?") ? `?${req.url.split("?")[1]}` : "";
  const upstreamUrl = safeAbsoluteUrl(site.api_base_url, `/${restPath}${search}`);

  try {
    const headers = {
      accept: req.get("accept") || "*/*",
      authorization: req.get("authorization") || "",
      cookie: req.get("cookie") || "",
      "content-type": req.get("content-type") || "application/json",
      "user-agent": req.get("user-agent") || "ux-sdk-preview-proxy",
    };
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method.toUpperCase()) ? undefined : JSON.stringify(req.body || {}),
    });

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    return res.send(await upstream.text());
  } catch (error) {
    return res.status(502).json({ ok: false, reason: `preview api proxy failed: ${String(error)}` });
  }
}

app.all("/preview-api/:siteId/*", proxyPreviewApiRequest);

// ---------- Experiment API (MVP) ----------
// experiment = { id, site_id, key, status:"draft"|"running"|"paused", url_prefix, traffic, variants, goals, updated_at, published_at, version }

app.post("/api/experiments/real-apply", (req, res) => {
  const {
    site_id = "ab-sample",
    key,
    url_prefix,
    traffic = { A: 50, B: 50 },
    goals = ["checkout_complete"],
    variants
  } = req.body || {};

  if (!key || !url_prefix || !variants || !variants.A || !variants.B) {
    return res.status(400).json({ ok: false, reason: "missing key/url_prefix/variants" });
  }

  const existing = experimentStore.getByKey(site_id, key);

  const base = {
    id: existing?.id || rid(),
    site_id,
    key,
    url_prefix,
    traffic,
    goals,
    variants,
    status: "running",
    updated_at: now(),
    published_at: now(),
    archived_at: null,
    version: existing ? (existing.version || 0) + 1 : 1
  };

  experimentStore.upsert(base, (item) => item.site_id === site_id && item.key === key);
  return res.json({ ok: true, experiment: base });
});

// list
app.get("/api/experiments", (req, res) => {
  const site_id = req.query.site_id || "ab-sample";
  const list = experimentStore.list(site_id);
  return res.json({ ok: true, experiments: list });
});

// update status
app.patch("/api/experiments/:id", (req, res) => {
  const { id } = req.params;
  const status = normalizeExperimentStatus(req.body?.status, "");
  const site_id = String(req.body?.site_id || req.query.site_id || "").trim();
  if (!VALID_EXPERIMENT_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, reason: "invalid experiment status" });
  }
  if (!site_id) {
    return res.status(400).json({ ok: false, reason: "missing site_id" });
  }

  const current = experimentStore.getById(site_id, id);
  if (!current) return res.status(404).json({ ok: false, reason: "not found" });

  const currentStatus = normalizeExperimentStatus(current.status);
  if (!canTransitionExperimentStatus(currentStatus, status)) {
    return res.status(400).json({ ok: false, reason: `invalid transition: ${currentStatus} -> ${status}` });
  }

  const updated = experimentStore.patchById(site_id, id, (experiment) => {
    const next = {
      ...experiment,
      status,
      updated_at: now(),
    };
    if (status === "running" && !next.published_at) next.published_at = next.updated_at;
    if (status === "archived") next.archived_at = next.updated_at;
    return next;
  });

  return res.json({ ok: true, experiment: updated });
});

// delete
app.delete("/api/experiments/:id", (req, res) => {
  const { id } = req.params;
  const site_id = String(req.body?.site_id || req.query.site_id || "").trim();
  if (!site_id) {
    return res.status(400).json({ ok: false, reason: "missing site_id" });
  }
  const deleted = experimentStore.deleteById(site_id, id);
  if (!deleted) return res.status(404).json({ ok: false, reason: "not found" });
  return res.json({ ok: true });
});

// SDK config: running only + URL prefix match
app.get("/api/config", (req, res) => {
  const site_id = req.query.site_id || "ab-sample";
  const url = String(req.query.url || "");
  const pathname = (() => {
    try { return new URL(url).pathname; } catch { return url || "/"; }
  })();

  const running = experimentStore.list(site_id)
    .filter((x) => x.site_id === site_id && x.status === "running")
    .filter((x) => pathname.startsWith(x.url_prefix))
    .map((x) => ({
      key: x.key,
      url_prefix: x.url_prefix,
      traffic: x.traffic,
      goals: x.goals,
      variants: x.variants,
      version: x.version,
      published_at: x.published_at
    }));

  return res.json({ ok: true, site_id, pathname, experiments: running });
});

// ---------- Metrics (events.jsonl 기반) ----------
/**
 * GET /api/metrics?site_id=ab-sample&key=exp_checkout_cta_v1
 * returns A/B metrics:
 * - sessions, users, page_views, clicks, conversions(goal), cvr, bounce_rate
 * - top_clicked_elements
 *
 * MVP: events.jsonl 전체를 읽어서 집계(데이터 커지면 스트리밍/DB로 이동 권장)
 */
app.get("/api/metrics", (req, res) => {
  const site_id = req.query.site_id || "ab-sample";
  const key = String(req.query.key || "");
  if (!key) return res.status(400).json({ ok: false, reason: "missing key" });
  const out = metricsReadModel.getExperimentMetrics({ siteId: site_id, key });
  if (!out.ok && out.reason === "experiment not found") {
    return res.status(404).json(out);
  }
  return res.json(out);
});

app.get("/api/realtime/sessions", async (req, res) => {
  if (!redisSessionStore) {
    return res.status(503).json({ ok: false, reason: "redis realtime session store disabled" });
  }

  const site_id = String(req.query.site_id || "ab-sample");
  const limit = Math.max(1, Math.min(200, toInt(req.query.limit) ?? 50));

  try {
    const sessions = await redisSessionStore.listSessionStates({ siteId: site_id, limit });
    return res.json({ ok: true, site_id, source: "redis", sessions });
  } catch (error) {
    return res.status(500).json({ ok: false, reason: String(error) });
  }
});

// ---------- Sessions / Labels / Insights (UX-Stream v1) ----------
// NOTE: 현재는 JSONL 기반 MVP. (대용량에서는 range query/DB/streaming 권장)

app.get("/api/sessions", async (req, res) => {
  const site_id = String(req.query.site_id || "ab-sample");
  const from_ts = toNum(req.query.from_ts);
  const to_ts = toNum(req.query.to_ts);
  const limit_sessions = Math.max(1, Math.min(200, toInt(req.query.limit) ?? 50));
  const limit_events = Math.max(100, Math.min(200_000, toInt(req.query.limit_events) ?? 50_000));

  try {
    const labeled = await computeLabeledSessionSummaries(EVENTS_FILE, {
      site_id,
      from_ts,
      to_ts,
      limit_events,
      session_ttl_ms: 30 * 60 * 1000
    });

    const sessions = labeled
      .slice(0, limit_sessions)
      .map((x) => ({
        summary: x.summary,
        label: x.label
      }));

    return res.json({ ok: true, site_id, from_ts, to_ts, sessions });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: String(e) });
  }
});

app.get("/api/labels/summary", async (req, res) => {
  const site_id = String(req.query.site_id || "ab-sample");
  const from_ts = toNum(req.query.from_ts);
  const to_ts = toNum(req.query.to_ts);
  const limit_events = Math.max(100, Math.min(200_000, toInt(req.query.limit_events) ?? 100_000));

  try {
    const labeled = await computeLabeledSessionSummaries(EVENTS_FILE, {
      site_id,
      from_ts,
      to_ts,
      limit_events,
      session_ttl_ms: 30 * 60 * 1000
    });

    const summary = computeLabelsSummary(labeled);
    return res.json({ ok: true, site_id, from_ts, to_ts, summary });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: String(e) });
  }
});

app.get("/api/insights", async (req, res) => {
  const site_id = String(req.query.site_id || "ab-sample");
  const from_ts = toNum(req.query.from_ts);
  const to_ts = toNum(req.query.to_ts);
  const limit_events = Math.max(100, Math.min(200_000, toInt(req.query.limit_events) ?? 150_000));
  const reps = Math.max(1, Math.min(5, toInt(req.query.reps) ?? 3));
  const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;
  const model = typeof req.query.model === "string" ? req.query.model : undefined;
  const include_prompt = String(req.query.include_prompt || "") === "1";

  try {
    const labeled = await computeLabeledSessionSummaries(EVENTS_FILE, {
      site_id,
      from_ts,
      to_ts,
      limit_events,
      session_ttl_ms: 30 * 60 * 1000
    });

    const input = buildInsightsInput(site_id, labeled, { perLabelRepresentatives: reps });
    const result = await generateInsights(input, { provider, model });
    return res.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      fallback_reason: result.fallbackReason || null,
      input,
      output: result.output,
      prompt: include_prompt ? result.prompt : undefined
    });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: String(e) });
  }
});

app.use(
  "/api",
  createChatRoutes({
    files: {
      experimentsFile: EXP_FILE,
      eventsFile: EVENTS_FILE,
      productsFile: PRODUCTS_FILE,
      faqFile: FAQ_FILE,
      policiesFile: POLICIES_FILE,
      ordersFile: ORDERS_FILE,
      supportTicketsFile: SUPPORT_TICKETS_FILE,
      chatSessionsFile: CHAT_SESSIONS_FILE,
      chatEventsFile: CHAT_EVENTS_FILE,
      chatFeedbackFile: CHAT_FEEDBACK_FILE,
    },
  })
);

app.listen(PORT, () => {
  console.log(`✅ AB Sample running: http://localhost:${PORT}`);
  console.log(`📦 collecting events to: ${EVENTS_FILE}`);
  console.log(`🧪 experiments file: ${EXP_FILE}`);
  console.log(`🛰️  kafka dual write: ${infraConfig.kafka.enabled ? `enabled -> ${infraConfig.kafka.topicEvents}` : "disabled"}`);
  console.log(`🧠 redis session store: ${infraConfig.redis.enabled ? "enabled" : "disabled"}`);
  console.log(`📊 dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🧩 sessions api: http://localhost:${PORT}/api/sessions`);
  console.log(`⚡ realtime sessions: http://localhost:${PORT}/api/realtime/sessions`);
  console.log(`🏷️  labels summary: http://localhost:${PORT}/api/labels/summary`);
  console.log(`💡 insights: http://localhost:${PORT}/api/insights`);
});

async function shutdownInfra() {
  await Promise.allSettled([
    kafkaRuntime?.disconnect?.(),
    redisRuntime?.disconnect?.(),
  ]);
}

process.on("SIGINT", async () => {
  await shutdownInfra();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdownInfra();
  process.exit(0);
});
