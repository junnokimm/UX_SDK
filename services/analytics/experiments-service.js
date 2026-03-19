const { readJson, writeJson } = require("../data-store");

function createExperimentsService({ experimentsFile }) {
  function loadDb() {
    return readJson(experimentsFile, { experiments: [] }) || { experiments: [] };
  }

  function listExperiments(siteId) {
    const db = loadDb();
    return db.experiments
      .filter((x) => x.site_id === siteId)
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }

  function getByKey(siteId, key) {
    const db = loadDb();
    return db.experiments.find((x) => x.site_id === siteId && x.key === key) || null;
  }

  function saveDraft({
    siteId,
    key,
    urlPrefix,
    traffic,
    goals,
    variants,
    hypothesis,
    source,
  }) {
    const db = loadDb();
    const sameKeyRecords = db.experiments.filter((x) => x.site_id === siteId && x.key === key);
    const liveRecord = sameKeyRecords.find(
      (x) => x.status === "running" || x.status === "paused" || !!x.published_at
    );
    const existingDraftIndex = db.experiments.findIndex(
      (x) => x.site_id === siteId && x.key === key && x.status === "draft" && !x.published_at
    );
    const now = Date.now();
    const existing = liveRecord || (existingDraftIndex >= 0 ? db.experiments[existingDraftIndex] : null);
    const hasLiveRecord = !!liveRecord;

    const draftKey = hasLiveRecord ? `${key}__draft_${now}` : key;

    const draft = {
      id: hasLiveRecord ? `exp_${Math.random().toString(16).slice(2, 10)}` : existing?.id || `exp_${Math.random().toString(16).slice(2, 10)}`,
      site_id: siteId,
      key: draftKey,
      parent_key: hasLiveRecord ? key : existing?.parent_key || null,
      url_prefix: urlPrefix,
      traffic: traffic || { A: 50, B: 50 },
      goals: Array.isArray(goals) && goals.length ? goals : ["checkout_complete"],
      variants: variants || { A: [], B: [] },
      status: "draft",
      hypothesis: hypothesis || "",
      source: source || "chatbot",
      updated_at: now,
      published_at: existing?.published_at || null,
      version: existing ? (existing.version || 0) + 1 : 1,
    };

    if (existingDraftIndex >= 0 && !hasLiveRecord) db.experiments[existingDraftIndex] = draft;
    else db.experiments.push(draft);

    writeJson(experimentsFile, db);
    return draft;
  }

  return {
    listExperiments,
    getByKey,
    saveDraft,
  };
}

module.exports = { createExperimentsService };
