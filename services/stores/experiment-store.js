const { readJson, writeJson } = require("../data-store");

function createFileExperimentStore({ experimentsFile }) {
  function load() {
    return readJson(experimentsFile, { experiments: [] }) || { experiments: [] };
  }

  function save(db) {
    writeJson(experimentsFile, db);
    return db;
  }

  function list(siteId) {
    const db = load();
    return db.experiments
      .filter((item) => !siteId || item.site_id === siteId)
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }

  function getByKey(siteId, key) {
    return load().experiments.find((item) => item.site_id === siteId && item.key === key) || null;
  }

  function getById(siteId, id) {
    return load().experiments.find((item) => item.site_id === siteId && item.id === id) || null;
  }

  function upsert(experiment, matchFn) {
    const db = load();
    const index = db.experiments.findIndex(matchFn);
    if (index >= 0) db.experiments[index] = experiment;
    else db.experiments.push(experiment);
    save(db);
    return experiment;
  }

  function patchById(siteId, id, updater) {
    const db = load();
    const index = db.experiments.findIndex((item) => item.id === id && item.site_id === siteId);
    if (index < 0) return null;
    const current = db.experiments[index];
    const next = typeof updater === "function" ? updater(current) : current;
    db.experiments[index] = next;
    save(db);
    return next;
  }

  function deleteById(siteId, id) {
    const db = load();
    const before = db.experiments.length;
    db.experiments = db.experiments.filter((item) => !(item.id === id && item.site_id === siteId));
    if (db.experiments.length === before) return false;
    save(db);
    return true;
  }

  return {
    load,
    save,
    list,
    getByKey,
    getById,
    upsert,
    patchById,
    deleteById,
  };
}

module.exports = { createFileExperimentStore };
