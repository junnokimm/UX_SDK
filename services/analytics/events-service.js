const { readJsonl } = require("../data-store");

function createEventsService({ eventsFile }) {
  function getEventSummary({ siteId, page }) {
    const events = readJsonl(eventsFile).filter((e) => e.site_id === siteId);
    const filtered = page ? events.filter((e) => (e.path || "").startsWith(page)) : events;

    const pageViews = new Map();
    const elementClicks = new Map();
    const sessionTimeline = new Map();
    let checkoutComplete = 0;
    let checkoutPageViews = 0;
    let detailPageViews = 0;

    for (const e of filtered) {
      if (e.event_name === "page_view") {
        pageViews.set(e.path || "/", (pageViews.get(e.path || "/") || 0) + 1);
        if (e.path === "/checkout") checkoutPageViews += 1;
        if (e.path === "/detail") detailPageViews += 1;
      }
      if (e.event_name === "click") {
        const elementId = e.props?.element_id || "(unknown)";
        elementClicks.set(elementId, (elementClicks.get(elementId) || 0) + 1);
      }
      if (e.event_name === "checkout_complete") checkoutComplete += 1;

      const sid = e.session_id || "no_session";
      if (!sessionTimeline.has(sid)) sessionTimeline.set(sid, []);
      sessionTimeline.get(sid).push({ ts: e.ts || e.received_at || 0, path: e.path || "/" });
    }

    const transitionCount = new Map();
    for (const list of sessionTimeline.values()) {
      list.sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < list.length; i += 1) {
        const prev = list[i - 1].path;
        const next = list[i].path;
        if (prev === next) continue;
        const key = `${prev}=>${next}`;
        transitionCount.set(key, (transitionCount.get(key) || 0) + 1);
      }
    }

    const topPages = Array.from(pageViews.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    const topElements = Array.from(elementClicks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([element_id, count]) => ({ element_id, count }));

    const flow = Array.from(transitionCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([edge, count]) => {
        const [from, to] = edge.split("=>");
        return { from, to, count };
      });

    return {
      ok: true,
      site_id: siteId,
      total_events: filtered.length,
      top_pages: topPages,
      top_elements: topElements,
      page_flow: flow,
      funnel: {
        detail_page_view: detailPageViews,
        checkout_page_view: checkoutPageViews,
        checkout_complete: checkoutComplete,
        checkout_completion_rate: checkoutPageViews > 0 ? checkoutComplete / checkoutPageViews : 0,
      },
    };
  }

  return { getEventSummary };
}

module.exports = { createEventsService };
