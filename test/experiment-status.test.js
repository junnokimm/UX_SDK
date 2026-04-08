const test = require("node:test");
const assert = require("node:assert/strict");

const {
  VALID_EXPERIMENT_STATUSES,
  canTransitionExperimentStatus,
  normalizeExperimentStatus,
} = require("../services/analytics/experiment-status");

test("experiment status catalog includes archived", () => {
  assert.deepEqual(VALID_EXPERIMENT_STATUSES, ["draft", "running", "paused", "archived"]);
  assert.equal(normalizeExperimentStatus("ARCHIVED"), "archived");
});

test("experiment transitions follow agreed lifecycle", () => {
  assert.equal(canTransitionExperimentStatus("draft", "running"), true);
  assert.equal(canTransitionExperimentStatus("draft", "archived"), true);
  assert.equal(canTransitionExperimentStatus("running", "paused"), true);
  assert.equal(canTransitionExperimentStatus("paused", "running"), true);
  assert.equal(canTransitionExperimentStatus("paused", "archived"), true);

  assert.equal(canTransitionExperimentStatus("running", "draft"), false);
  assert.equal(canTransitionExperimentStatus("archived", "running"), false);
});
