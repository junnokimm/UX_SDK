const { readJson } = require("../data-store");

function createProductService({ productsFile }) {
  function listProducts() {
    const db = readJson(productsFile, { products: [] }) || { products: [] };
    return db.products;
  }

  function searchProducts(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return listProducts().slice(0, 8);

    const tokens = q.split(/\s+/).filter(Boolean);

    const scored = listProducts().map((p) => {
      const name = String(p.name || "").toLowerCase();
      const description = String(p.description || "").toLowerCase();
      const category = String(p.category || "").toLowerCase();
      const tags = Array.isArray(p.tags) ? p.tags.map((x) => String(x).toLowerCase()) : [];
      const specs = Array.isArray(p.specs) ? p.specs.map((x) => String(x).toLowerCase()) : [];

      const fullText = [p.id, p.name, p.description, p.category, ...tags, ...specs].join(" ").toLowerCase();
      let score = 0;

      if (name === q || String(p.id || "").toLowerCase() === q) score += 20;
      if (name.includes(q)) score += 10;
      if (description.includes(q)) score += 6;
      if (category === q) score += 10;

      for (const token of tokens) {
        if (name.includes(token)) score += 7;
        if (description.includes(token)) score += 3;
        if (category.includes(token)) score += 5;
        if (tags.some((t) => t.includes(token))) score += 4;
        if (specs.some((s) => s.includes(token))) score += 4;
      }

      const asksInStock = tokens.includes("재고") || tokens.includes("있는") || tokens.includes("in-stock");
      if (asksInStock && Number(p.stock || 0) > 0 && score > 0) score += 5;

      const matched = score > 0 || fullText.includes(q);
      return { product: p, score, matched };
    });

    return scored
      .filter((x) => x.matched)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return Number(b.product.stock || 0) - Number(a.product.stock || 0);
      })
      .map((x) => x.product);
  }

  function getProductDetail(productId) {
    return listProducts().find((p) => p.id === productId) || null;
  }

  return {
    listProducts,
    searchProducts,
    getProductDetail,
  };
}

module.exports = { createProductService };
