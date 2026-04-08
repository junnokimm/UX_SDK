const test = require("node:test");
const assert = require("node:assert/strict");

const { createRedisSessionStore } = require("../services/stores/redis-session-store");

function createFakeRedisRuntime(initial = {}, keyPrefix = "") {
  const data = new Map(Object.entries(initial));
  const withPrefix = (key) => `${keyPrefix}${key}`;
  return {
    async connect() {
      return {
        async set(key, value) {
          data.set(withPrefix(key), value);
        },
        async get(key) {
          return data.get(withPrefix(key)) || null;
        },
        async keys(pattern) {
          const prefixedPattern = withPrefix(pattern);
          const regex = new RegExp(`^${prefixedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
          return Array.from(data.keys()).filter((key) => regex.test(key));
        },
        async mget(keys) {
          return keys.map((key) => data.get(key) || null);
        },
      };
    },
  };
}

test("redis session store lists session states newest first", async () => {
  const runtime = createFakeRedisRuntime({
    "uxsdk:session:legend-ecommerce:s1": JSON.stringify({ session_id: "s1", last_ts: 1000 }),
    "uxsdk:session:legend-ecommerce:s2": JSON.stringify({ session_id: "s2", last_ts: 1500 }),
  }, "uxsdk:");

  const store = createRedisSessionStore({
    redisRuntime: runtime,
    sessionTtlSec: 1800,
    assignmentTtlSec: 100,
  });

  const sessions = await store.listSessionStates({ siteId: "legend-ecommerce", limit: 10 });
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].session_id, "s2");
  assert.equal(sessions[1].session_id, "s1");
});
