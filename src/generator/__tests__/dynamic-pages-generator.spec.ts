/**
 * Tests for dynamic-pages-generator.ts
 *
 * Validates:
 * - Product page generation with getStaticPaths
 * - Collection page generation with getStaticPaths
 * - Layout wrapping
 * - API URL and shop ID injection
 * - Correct Astro file syntax
 */

import {
  generateProductPage,
  generateCollectionPage,
  type DynamicPageConfig,
} from "../dynamic-pages-generator";

const BASE_CONFIG: DynamicPageConfig = {
  apiUrl: "https://gateway.merfy.ru/api",
  shopId: "shop-123",
};

const CONFIG_WITH_LAYOUT: DynamicPageConfig = {
  ...BASE_CONFIG,
  layoutImport: "../../layouts/StoreLayout.astro",
  layoutTag: "StoreLayout",
};

describe("generateProductPage", () => {
  it("generates valid .astro file with frontmatter delimiters", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toMatch(/^---\n/);
    expect(result).toMatch(/\n---\n/);
  });

  it("includes getStaticPaths function", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toContain("getStaticPaths");
  });

  it("uses the provided API URL for fetching", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toContain("https://gateway.merfy.ru/api");
  });

  it("uses the provided shop ID in the API path", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toContain("shop-123");
  });

  it("wraps content in layout when layout config provided", () => {
    const result = generateProductPage(CONFIG_WITH_LAYOUT);

    expect(result).toContain(
      "import StoreLayout from '../../layouts/StoreLayout.astro';",
    );
    expect(result).toContain("<StoreLayout>");
    expect(result).toContain("</StoreLayout>");
  });

  it("generates product detail template structure", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toContain("product-detail");
    expect(result).toContain("product.name");
    expect(result).toContain("product.price");
    expect(result).toContain("product.images");
  });

  it("includes buy button with data attributes", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toContain("buy-button");
    expect(result).toContain("data-product-id");
    expect(result).toContain("data-product-price");
  });

  it("includes price formatting function", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toContain("formatPrice");
    expect(result).toContain("Intl.NumberFormat");
    expect(result).toContain("ru-RU");
  });

  it("handles Astro.props destructuring", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toContain("const { product } = Astro.props;");
  });

  it("fetches product data with fallback for slug/handle/id", () => {
    const result = generateProductPage(BASE_CONFIG);

    expect(result).toContain("p.slug || p.handle || p.id");
  });
});

describe("generateCollectionPage", () => {
  it("generates valid .astro file with frontmatter delimiters", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    expect(result).toMatch(/^---\n/);
    expect(result).toMatch(/\n---\n/);
  });

  it("includes getStaticPaths function", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    expect(result).toContain("getStaticPaths");
  });

  it("uses the provided API URL", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    expect(result).toContain("https://gateway.merfy.ru/api");
  });

  it("uses the provided shop ID", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    expect(result).toContain("shop-123");
  });

  it("wraps content in layout when layout config provided", () => {
    const result = generateCollectionPage(CONFIG_WITH_LAYOUT);

    expect(result).toContain(
      "import StoreLayout from '../../layouts/StoreLayout.astro';",
    );
    expect(result).toContain("<StoreLayout>");
    expect(result).toContain("</StoreLayout>");
  });

  it("generates collection page template with product grid", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    expect(result).toContain("collection-page");
    expect(result).toContain("collection.name");
    expect(result).toContain("product-grid");
  });

  it("destructures both collection and products from props", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    expect(result).toContain(
      "const { collection, products } = Astro.props;",
    );
  });

  it("includes price formatting function", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    expect(result).toContain("formatPrice");
  });

  it("fetches collection products in getStaticPaths", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    // Verifies nested fetch for collection products
    expect(result).toContain("/collections/");
    expect(result).toContain("/products");
  });

  it("handles empty collections gracefully", () => {
    const result = generateCollectionPage(BASE_CONFIG);

    expect(result).toContain("collections = [];");
  });
});
