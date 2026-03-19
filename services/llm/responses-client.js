function createOpenAIClient({ apiKey, model }) {
  return {
    mode: "openai",
    async rewrite({ systemPrompt, userPrompt, draftAnswer }) {
      if (!apiKey) {
        return { ok: false, reason: "missing_api_key", text: draftAnswer };
      }

      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || "gpt-4.1-mini",
            input: [
              {
                role: "system",
                content: [{ type: "text", text: systemPrompt }],
              },
              {
                role: "user",
                content: [{ type: "text", text: userPrompt }],
              },
            ],
          }),
        });

        if (!response.ok) {
          const txt = await response.text();
          return { ok: false, reason: `http_${response.status}`, detail: txt, text: draftAnswer };
        }

        const data = await response.json();
        const text = Array.isArray(data.output)
          ? data.output
              .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
              .filter((c) => c.type === "output_text")
              .map((c) => c.text)
              .join("\n")
          : "";

        return { ok: true, text: text || draftAnswer, raw: data };
      } catch (error) {
        return { ok: false, reason: "network_error", detail: String(error), text: draftAnswer };
      }
    },
  };
}

module.exports = {
  createOpenAIClient,
};
