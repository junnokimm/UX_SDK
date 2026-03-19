const { getLlmConfig } = require("./config");
const { createMockClient } = require("./mock-client");
const { createOpenAIClient } = require("./responses-client");

function createLlmClient() {
  const cfg = getLlmConfig();
  if (cfg.provider === "openai" && cfg.hasOpenAIKey) {
    return createOpenAIClient({ apiKey: cfg.openaiApiKey, model: cfg.openaiModel });
  }
  return createMockClient();
}

module.exports = {
  createLlmClient,
};
