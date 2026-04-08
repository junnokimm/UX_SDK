const { readJson, writeJson } = require("../data-store");

function createFileSiteRegistryStore({ sitesFile }) {
  function load() {
    return readJson(sitesFile, { sites: [] }) || { sites: [] };
  }

  function save(db) {
    writeJson(sitesFile, db);
    return db;
  }

  function listRaw() {
    return load().sites || [];
  }

  function getRawById(siteId) {
    return listRaw().find((site) => String(site?.site_id || "").trim() === siteId) || null;
  }

  function patchRawById(siteId, updater) {
    const db = load();
    const index = (db.sites || []).findIndex((site) => String(site?.site_id || "").trim() === siteId);
    if (index < 0) return null;
    const current = db.sites[index];
    const next = typeof updater === "function" ? updater(current) : current;
    db.sites[index] = next;
    save(db);
    return next;
  }

  return {
    load,
    save,
    listRaw,
    getRawById,
    patchRawById,
  };
}

module.exports = { createFileSiteRegistryStore };
