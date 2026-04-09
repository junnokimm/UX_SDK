const path = require("path");
const { ensureJsonlFile } = require("../services/data-store");
const { loadEnvFromFile } = require("../services/llm/config");
const { getInfraConfig } = require("../services/runtime/infra-config");
const { createKafkaRuntime } = require("../services/runtime/kafka");
const { createRedisRuntime } = require("../services/runtime/redis");
const { createConsumedEventStore } = require("../services/stores/consumed-event-store");
const { createRedisSessionStore } = require("../services/stores/redis-session-store");
const { createRedisMetricsStore } = require("../services/stores/redis-metrics-store");
const { mergeSessionState, extractVariantAssignments } = require("../services/analytics/session-state");

loadEnvFromFile();

const DATA_DIR = path.join(__dirname, "..", "data");
const CONSUMED_EVENTS_FILE = path.join(DATA_DIR, "events.consumed.jsonl");
ensureJsonlFile(CONSUMED_EVENTS_FILE);

const infraConfig = getInfraConfig();
const kafkaRuntime = createKafkaRuntime({
  brokers: infraConfig.kafka.brokers,
  clientId: `${infraConfig.kafka.clientId}-consumer`,
});
const consumedEventStore = createConsumedEventStore({ consumedEventsFile: CONSUMED_EVENTS_FILE });
const redisRuntime = infraConfig.redis.enabled
  ? createRedisRuntime({ url: infraConfig.redis.url, keyPrefix: infraConfig.redis.keyPrefix })
  : null;
const redisSessionStore = redisRuntime
  ? createRedisSessionStore({
      redisRuntime,
      sessionTtlSec: infraConfig.redis.sessionTtlSec,
      assignmentTtlSec: infraConfig.redis.assignmentTtlSec,
    })
  : null;
const redisMetricsStore = redisRuntime ? createRedisMetricsStore({ redisRuntime }) : null;

async function mirrorEventToRedis(event) {
  if (!redisSessionStore) return;

  const assignments = extractVariantAssignments(event);
  for (const assignment of assignments) {
    await redisSessionStore.setVariantAssignment(assignment);
    if (redisMetricsStore) {
      await redisMetricsStore.recordExperimentEvent({
        event,
        experimentKey: assignment.experimentKey,
        variant: assignment.variant,
        goals: event.experiment_goals || ["checkout_complete"],
      });
    }
  }

  if (event.site_id && event.session_id) {
    const current = await redisSessionStore.getSessionState({
      siteId: event.site_id,
      sessionId: event.session_id,
    });
    const next = mergeSessionState(current, event);
    await redisSessionStore.upsertSessionState({
      siteId: event.site_id,
      sessionId: event.session_id,
      state: next,
    });
  }
}

async function start() {
  const topic = infraConfig.kafka.topicEvents;
  const groupId = infraConfig.kafka.consumerGroupId;

  console.log(`[consumer] starting group=${groupId} topic=${topic} fromBeginning=${infraConfig.kafka.fromBeginning}`);

  const consumer = await kafkaRuntime.createConsumer({
    groupId,
    topics: [topic],
    fromBeginning: infraConfig.kafka.fromBeginning,
    eachMessage: async ({ topic: consumedTopic, partition, message }) => {
      const rawValue = message.value ? message.value.toString() : "";
      if (!rawValue) return;

      let parsed;
      try {
        parsed = JSON.parse(rawValue);
      } catch (error) {
        console.warn("[consumer] failed to parse message", error);
        return;
      }

      consumedEventStore.append({
        consumed_at: Date.now(),
        topic: consumedTopic,
        partition,
        offset: message.offset,
        key: message.key ? message.key.toString() : null,
        event: parsed,
      });

      await mirrorEventToRedis(parsed);

      console.log(`[consumer] ${parsed.event_name || "unknown"} site=${parsed.site_id || "-"} session=${parsed.session_id || "-"} offset=${message.offset}`);
    },
  });

  async function shutdown(signal) {
    console.log(`[consumer] shutting down on ${signal}`);
    await Promise.allSettled([
      consumer.disconnect(),
      kafkaRuntime.disconnect(),
      redisRuntime?.disconnect?.(),
    ]);
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch(async (error) => {
  console.error("[consumer] fatal error", error);
  await Promise.allSettled([
    kafkaRuntime.disconnect(),
    redisRuntime?.disconnect?.(),
  ]);
  process.exit(1);
});
