function buildStatsKey({ siteId, key, variant }) {
  return `metrics:exp:${siteId}:${key}:${variant}:stats`;
}

function buildUsersKey({ siteId, key, variant }) {
  return `metrics:exp:${siteId}:${key}:${variant}:users`;
}

function buildSessionsKey({ siteId, key, variant }) {
  return `metrics:exp:${siteId}:${key}:${variant}:sessions`;
}

function buildSessionStatsKey({ siteId, key, variant, sessionId }) {
  return `metrics:exp:${siteId}:${key}:${variant}:session:${sessionId}`;
}

function buildClicksKey({ siteId, key, variant }) {
  return `metrics:exp:${siteId}:${key}:${variant}:clicks`;
}

function createRedisMetricsStore({ redisRuntime }) {
  async function recordExperimentEvent({ event, experimentKey, variant, goals }) {
    const client = await redisRuntime.connect();
    const siteId = event.site_id;
    const sessionId = event.session_id || "no_session";
    const anonUserId = event.anon_user_id || "no_user";
    const goalList = Array.isArray(goals) ? goals : ["checkout_complete"];

    const statsKey = buildStatsKey({ siteId, key: experimentKey, variant });
    const usersKey = buildUsersKey({ siteId, key: experimentKey, variant });
    const sessionsKey = buildSessionsKey({ siteId, key: experimentKey, variant });
    const sessionStatsKey = buildSessionStatsKey({ siteId, key: experimentKey, variant, sessionId });
    const clicksKey = buildClicksKey({ siteId, key: experimentKey, variant });

    const tx = client.multi();
    tx.hincrby(statsKey, "events", 1);
    tx.sadd(usersKey, anonUserId);
    tx.sadd(sessionsKey, sessionId);
    tx.hincrby(sessionStatsKey, "total_events", 1);

    if (event.event_name === "page_view") {
      tx.hincrby(statsKey, "page_views", 1);
      tx.hincrby(sessionStatsKey, "page_views", 1);
    }
    if (event.event_name === "click") {
      tx.hincrby(statsKey, "clicks", 1);
      tx.zincrby(clicksKey, 1, event.props?.element_id || "(no_element_id)");
    }
    if (goalList.includes(event.event_name)) {
      tx.hincrby(statsKey, "conversions", 1);
    }

    await tx.exec();
  }

  async function getExperimentMetrics({ siteId, key, goals, experiment }) {
    const client = await redisRuntime.connect();
    const goalList = Array.isArray(goals) && goals.length ? goals : ["checkout_complete"];

    async function readVariant(variant) {
      const statsKey = buildStatsKey({ siteId, key, variant });
      const usersKey = buildUsersKey({ siteId, key, variant });
      const sessionsKey = buildSessionsKey({ siteId, key, variant });
      const clicksKey = buildClicksKey({ siteId, key, variant });
      const [statsRaw, users, sessions, topClicks, sessionKeys] = await Promise.all([
        client.hgetall(statsKey),
        client.scard(usersKey),
        client.scard(sessionsKey),
        client.zrevrange(clicksKey, 0, 9, "WITHSCORES"),
        client.keys(buildSessionStatsKey({ siteId, key, variant, sessionId: "*" })),
      ]);

      const stats = {
        events: Number(statsRaw?.events || 0),
        page_views: Number(statsRaw?.page_views || 0),
        clicks: Number(statsRaw?.clicks || 0),
        conversions: Number(statsRaw?.conversions || 0),
      };

      let bounces = 0;
      if (sessionKeys.length) {
        const sessionStats = await Promise.all(sessionKeys.map((sessionKey) => client.hgetall(sessionKey)));
        for (const item of sessionStats) {
          if (Number(item?.page_views || 0) === 1 && Number(item?.total_events || 0) === 1) bounces += 1;
        }
      }

      const top_clicked_elements = [];
      for (let i = 0; i < topClicks.length; i += 2) {
        top_clicked_elements.push({
          element_id: topClicks[i],
          count: Number(topClicks[i + 1] || 0),
        });
      }

      return {
        users,
        sessions,
        page_views: stats.page_views,
        clicks: stats.clicks,
        conversions: stats.conversions,
        cvr: sessions > 0 ? stats.conversions / sessions : 0,
        ctr: stats.page_views > 0 ? stats.clicks / stats.page_views : 0,
        bounce_rate: sessions > 0 ? bounces / sessions : 0,
        top_clicked_elements,
        _events: stats.events,
      };
    }

    const [A, B] = await Promise.all([readVariant("A"), readVariant("B")]);
    const totalEvents = (A._events || 0) + (B._events || 0);
    if (totalEvents === 0) return null;

    delete A._events;
    delete B._events;

    return {
      ok: true,
      source: "redis",
      site_id: siteId,
      key,
      goals: goalList,
      experiment: {
        id: experiment.id,
        status: experiment.status,
        url_prefix: experiment.url_prefix,
        version: experiment.version,
        published_at: experiment.published_at,
      },
      A,
      B,
      totals: { events: totalEvents },
    };
  }

  return {
    recordExperimentEvent,
    getExperimentMetrics,
  };
}

module.exports = { createRedisMetricsStore };
