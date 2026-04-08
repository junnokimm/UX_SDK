const { appendJsonl, readJsonl } = require("../data-store");

function createFileEventStore({ eventsFile }) {
  function appendBatch(events, meta) {
    const list = Array.isArray(events) ? events.filter(Boolean) : [];
    if (list.length === 0) return { written: 0 };

    const receivedAt = typeof meta?.received_at === "number" ? meta.received_at : Date.now();
    const requestId = typeof meta?.request_id === "string" ? meta.request_id : "";
    for (const event of list) {
      appendJsonl(eventsFile, {
        ...event,
        received_at: receivedAt,
        request_id: requestId,
      });
    }
    return { written: list.length, received_at: receivedAt, request_id: requestId };
  }

  function readAll() {
    return readJsonl(eventsFile);
  }

  return {
    appendBatch,
    readAll,
  };
}

module.exports = { createFileEventStore };
