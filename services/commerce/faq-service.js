const { readJson } = require("../data-store");

function createFaqService({ faqFile, policiesFile }) {
  function listFaq() {
    const db = readJson(faqFile, { faq: [] }) || { faq: [] };
    return db.faq;
  }

  function listPolicies() {
    const db = readJson(policiesFile, { policies: [] }) || { policies: [] };
    return db.policies;
  }

  function faqSearch(query) {
    const q = String(query || "").trim().toLowerCase();
    const corpus = [
      ...listFaq().map((x) => ({ type: "faq", ...x })),
      ...listPolicies().map((x) => ({ type: "policy", ...x })),
    ];

    if (!q) return corpus.slice(0, 5);

    const scored = corpus.map((item) => {
      const text = `${item.question || ""} ${item.answer || ""} ${item.topic || ""}`.toLowerCase();
      let score = 0;
      for (const token of q.split(/\s+/)) {
        if (token && text.includes(token)) score += 1;
      }
      return { item, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.item);
  }

  return {
    faqSearch,
    listFaq,
    listPolicies,
  };
}

module.exports = { createFaqService };
