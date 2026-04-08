function buildAssignmentKey({ siteId, experimentKey, anonUserId }) {
  return `ab:assign:${siteId}:${experimentKey}:${anonUserId}`;
}

function buildSessionKey({ siteId, sessionId }) {
  return `session:${siteId}:${sessionId}`;
}

function createRedisSessionStore({ redisRuntime, sessionTtlSec, assignmentTtlSec }) {
  async function listSessionStates({ siteId, limit = 50 }) {
    const client = await redisRuntime.connect();
    const pattern = buildSessionKey({ siteId, sessionId: "*" });
    const keys = await client.keys(pattern);
    if (keys.length === 0) return [];

    const values = await client.mget(keys);
    const items = [];
    for (let i = 0; i < keys.length; i += 1) {
      const value = values[i];
      if (!value) continue;
      try {
        items.push(JSON.parse(value));
      } catch {
        continue;
      }
    }

    return items
      .sort((a, b) => (Number(b?.last_ts) || 0) - (Number(a?.last_ts) || 0))
      .slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));
  }

  async function setVariantAssignment({ siteId, experimentKey, anonUserId, variant, version }) {
    const client = await redisRuntime.connect();
    const key = buildAssignmentKey({ siteId, experimentKey, anonUserId });
    const payload = JSON.stringify({ variant, version: version || null, updated_at: Date.now() });
    await client.set(key, payload, "EX", assignmentTtlSec);
    return { ok: true, key };
  }

  async function getVariantAssignment({ siteId, experimentKey, anonUserId }) {
    const client = await redisRuntime.connect();
    const key = buildAssignmentKey({ siteId, experimentKey, anonUserId });
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  async function upsertSessionState({ siteId, sessionId, state }) {
    const client = await redisRuntime.connect();
    const key = buildSessionKey({ siteId, sessionId });
    const payload = JSON.stringify({ ...(state || {}), updated_at: Date.now() });
    await client.set(key, payload, "EX", sessionTtlSec);
    return { ok: true, key };
  }

  async function getSessionState({ siteId, sessionId }) {
    const client = await redisRuntime.connect();
    const key = buildSessionKey({ siteId, sessionId });
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return {
    listSessionStates,
    setVariantAssignment,
    getVariantAssignment,
    upsertSessionState,
    getSessionState,
  };
}

module.exports = { createRedisSessionStore };
