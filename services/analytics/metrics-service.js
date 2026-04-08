const { createFileEventStore } = require("../stores/event-store");
const { createFileExperimentStore } = require("../stores/experiment-store");
const { createMetricsReadModel } = require("../read-models/metrics-read-model");

function createMetricsService({ experimentsFile, eventsFile, eventStore, experimentStore, metricsReadModel }) {
  const resolvedEventStore = eventStore || createFileEventStore({ eventsFile });
  const resolvedExperimentStore = experimentStore || createFileExperimentStore({ experimentsFile });
  const resolvedReadModel = metricsReadModel || createMetricsReadModel({
    eventStore: resolvedEventStore,
    experimentStore: resolvedExperimentStore,
  });

  function getMetrics({ siteId, key }) {
    return resolvedReadModel.getExperimentMetrics({ siteId, key });
  }

  return { getMetrics };
}

module.exports = { createMetricsService };
