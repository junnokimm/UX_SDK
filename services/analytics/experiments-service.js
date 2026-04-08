const { createFileExperimentStore } = require("../stores/experiment-store");
const { normalizeExperimentStatus } = require("./experiment-status");

function createExperimentsService({ experimentsFile, experimentStore }) {
  const store = experimentStore || createFileExperimentStore({ experimentsFile });

  function listExperiments(siteId) {
    return store.list(siteId);
  }

  function getByKey(siteId, key) {
    return store.getByKey(siteId, key);
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
    const sameKeyRecords = store.list(siteId).filter((x) => x.key === key);
    const liveRecord = sameKeyRecords.find(
      (x) => normalizeExperimentStatus(x.status) === "running" || normalizeExperimentStatus(x.status) === "paused"
    ) || sameKeyRecords.find((x) => normalizeExperimentStatus(x.status) === "archived") || null;
    const existingDraft = sameKeyRecords.find((x) => x.status === "draft" && !x.published_at) || null;
    const now = Date.now();
    const existing = liveRecord || existingDraft;
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
      published_at: null,
      archived_at: null,
      version: existing ? (existing.version || 0) + 1 : 1,
    };

    store.upsert(draft, (item) => item.id === draft.id && item.site_id === draft.site_id);
    return draft;
  }

  return {
    listExperiments,
    getByKey,
    saveDraft,
  };
}

module.exports = { createExperimentsService };
