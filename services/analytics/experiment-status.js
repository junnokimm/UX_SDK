const VALID_EXPERIMENT_STATUSES = ["draft", "running", "paused", "archived"];

const ALLOWED_TRANSITIONS = {
  draft: new Set(["running", "archived"]),
  running: new Set(["paused"]),
  paused: new Set(["running", "archived"]),
  archived: new Set([]),
};

function normalizeExperimentStatus(status, fallback = "draft") {
  const value = typeof status === "string" ? status.trim().toLowerCase() : "";
  return VALID_EXPERIMENT_STATUSES.includes(value) ? value : fallback;
}

function canTransitionExperimentStatus(fromStatus, toStatus) {
  const from = normalizeExperimentStatus(fromStatus, "draft");
  const to = normalizeExperimentStatus(toStatus, "");
  if (!to) return false;
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.has(to) || false;
}

module.exports = {
  VALID_EXPERIMENT_STATUSES,
  normalizeExperimentStatus,
  canTransitionExperimentStatus,
};
