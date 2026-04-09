const test = require("node:test");
const assert = require("node:assert/strict");

const { createRedisMetricsStore } = require("../services/stores/redis-metrics-store");

function createFakeRedisRuntime() {
  const hashes = new Map();
  const sets = new Map();
  const zsets = new Map();
  return {
    async connect() {
      return {
        multi() {
          const ops = [];
          return {
            hincrby(key, field, inc) { ops.push(["hincrby", key, field, inc]); return this; },
            sadd(key, value) { ops.push(["sadd", key, value]); return this; },
            zincrby(key, inc, member) { ops.push(["zincrby", key, inc, member]); return this; },
            async exec() {
              for (const op of ops) {
                const [type, key, a, b] = op;
                if (type === "hincrby") {
                  const map = hashes.get(key) || new Map();
                  map.set(a, (Number(map.get(a) || 0) + Number(b)));
                  hashes.set(key, map);
                } else if (type === "sadd") {
                  const set = sets.get(key) || new Set();
                  set.add(a);
                  sets.set(key, set);
                } else if (type === "zincrby") {
                  const map = zsets.get(key) || new Map();
                  map.set(b, (Number(map.get(b) || 0) + Number(a)));
                  zsets.set(key, map);
                }
              }
              return [];
            },
          };
        },
        async hgetall(key) {
          const map = hashes.get(key) || new Map();
          return Object.fromEntries(map.entries());
        },
        async scard(key) {
          return (sets.get(key) || new Set()).size;
        },
        async zrevrange(key, start, stop, withScores) {
          const entries = Array.from((zsets.get(key) || new Map()).entries()).sort((a, b) => b[1] - a[1]).slice(start, stop + 1);
          if (withScores === "WITHSCORES") {
            return entries.flatMap(([member, score]) => [member, String(score)]);
          }
          return entries.map(([member]) => member);
        },
        async keys(pattern) {
          const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
          return Array.from(hashes.keys()).filter((key) => regex.test(key));
        },
      };
    },
  };
}

test("redis metrics store records and reads variant metrics", async () => {
  const store = createRedisMetricsStore({ redisRuntime: createFakeRedisRuntime() });

  await store.recordExperimentEvent({
    event: { site_id: "legend-ecommerce", session_id: "s1", anon_user_id: "u1", event_name: "page_view", props: {} },
    experimentKey: "exp1",
    variant: "B",
    goals: ["checkout_complete"],
  });
  await store.recordExperimentEvent({
    event: { site_id: "legend-ecommerce", session_id: "s1", anon_user_id: "u1", event_name: "click", props: { element_id: "cta" } },
    experimentKey: "exp1",
    variant: "B",
    goals: ["checkout_complete"],
  });
  await store.recordExperimentEvent({
    event: { site_id: "legend-ecommerce", session_id: "s1", anon_user_id: "u1", event_name: "checkout_complete", props: {} },
    experimentKey: "exp1",
    variant: "B",
    goals: ["checkout_complete"],
  });

  const metrics = await store.getExperimentMetrics({
    siteId: "legend-ecommerce",
    key: "exp1",
    goals: ["checkout_complete"],
    experiment: { id: "1", status: "running", url_prefix: "/checkout", version: 1, published_at: 1 },
  });

  assert.equal(metrics.source, "redis");
  assert.equal(metrics.B.sessions, 1);
  assert.equal(metrics.B.page_views, 1);
  assert.equal(metrics.B.clicks, 1);
  assert.equal(metrics.B.conversions, 1);
  assert.equal(metrics.B.top_clicked_elements[0].element_id, "cta");
});
