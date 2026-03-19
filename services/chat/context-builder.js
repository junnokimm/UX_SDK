function buildChatContext({ context, messages }) {
  const latestUserMessage = [...(messages || [])]
    .reverse()
    .find((m) => m.role === "user" && typeof m.content === "string")?.content || "";

  return {
    page: context?.page || "unknown",
    selectedExperimentKey: context?.selectedExperimentKey || null,
    selectedElement: context?.selectedElement || null,
    productId: context?.productId || null,
    userId: context?.userId || "guest",
    sessionId: context?.sessionId || `chat_${Math.random().toString(16).slice(2, 10)}`,
    latestUserMessage,
  };
}

module.exports = { buildChatContext };
