function createMockClient() {
  return {
    mode: "mock",
    async rewrite({ draftAnswer }) {
      return {
        ok: true,
        text: draftAnswer,
        reason: "mock_mode",
      };
    },
  };
}

module.exports = { createMockClient };
