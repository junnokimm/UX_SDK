function createMetricsReadModel({ eventStore, experimentStore }) {
  function getExperimentMetrics({ siteId, key }) {
    const exp = experimentStore.getByKey(siteId, key);
    if (!exp) {
      return { ok: false, reason: "experiment not found" };
    }

    const goals = Array.isArray(exp.goals) && exp.goals.length ? exp.goals : ["checkout_complete"];
    const events = [];

    for (const e of eventStore.readAll()) {
      if (e.site_id !== siteId) continue;
      const exps = Array.isArray(e.experiments) ? e.experiments : [];
      const hit = exps.find((item) => item && item.key === key);
      if (!hit) continue;

      events.push({
        event_name: e.event_name,
        anon_user_id: e.anon_user_id,
        session_id: e.session_id,
        path: e.path,
        props: e.props || {},
        exp_variant: hit.variant || "A",
      });
    }

    const init = () => ({
      users: new Set(),
      sessions: new Set(),
      page_views: 0,
      clicks: 0,
      conversions: 0,
      sessionStats: new Map(),
      clickElements: new Map(),
    });

    const byVariant = { A: init(), B: init() };

    for (const e of events) {
      const bucket = e.exp_variant === "B" ? byVariant.B : byVariant.A;
      if (e.anon_user_id) bucket.users.add(e.anon_user_id);
      if (e.session_id) bucket.sessions.add(e.session_id);

      const sid = e.session_id || "no_session";
      if (!bucket.sessionStats.has(sid)) bucket.sessionStats.set(sid, { pageViews: 0, totalEvents: 0 });
      const stats = bucket.sessionStats.get(sid);
      stats.totalEvents += 1;

      if (e.event_name === "page_view") {
        bucket.page_views += 1;
        stats.pageViews += 1;
      }
      if (e.event_name === "click") {
        bucket.clicks += 1;
        const elementId = e.props?.element_id || "(no_element_id)";
        bucket.clickElements.set(elementId, (bucket.clickElements.get(elementId) || 0) + 1);
      }
      if (goals.includes(e.event_name)) bucket.conversions += 1;
    }

    function finalize(bucket) {
      const sessions = bucket.sessions.size;
      let bounces = 0;
      for (const stats of bucket.sessionStats.values()) {
        if (stats.pageViews === 1 && stats.totalEvents === 1) bounces += 1;
      }
      return {
        users: bucket.users.size,
        sessions,
        page_views: bucket.page_views,
        clicks: bucket.clicks,
        conversions: bucket.conversions,
        cvr: sessions > 0 ? bucket.conversions / sessions : 0,
        ctr: bucket.page_views > 0 ? bucket.clicks / bucket.page_views : 0,
        bounce_rate: sessions > 0 ? bounces / sessions : 0,
        top_clicked_elements: Array.from(bucket.clickElements.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([element_id, count]) => ({ element_id, count })),
      };
    }

    return {
      ok: true,
      site_id: siteId,
      key,
      goals,
      experiment: {
        id: exp.id,
        status: exp.status,
        url_prefix: exp.url_prefix,
        version: exp.version,
        published_at: exp.published_at,
      },
      A: finalize(byVariant.A),
      B: finalize(byVariant.B),
      totals: { events: events.length },
    };
  }

  return {
    getExperimentMetrics,
  };
}

module.exports = { createMetricsReadModel };
