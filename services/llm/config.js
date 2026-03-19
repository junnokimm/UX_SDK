const fs = require("fs");
const path = require("path");

let loaded = false;

function loadEnvFromFile() {
  if (loaded) return;
  loaded = true;

  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getLlmConfig() {
  loadEnvFromFile();
  const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();
  const openaiApiKey = process.env.OPENAI_API_KEY || "";
  const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  return {
    provider,
    openaiApiKey,
    openaiModel,
    hasOpenAIKey: !!openaiApiKey,
  };
}

module.exports = {
  loadEnvFromFile,
  getLlmConfig,
};
