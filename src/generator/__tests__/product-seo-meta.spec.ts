/**
 * Tests for T054/T055: Product detail SEO meta tags
 *
 * Validates the SEO fallback logic that will be used in the Astro template:
 * - metaTitle present -> use metaTitle
 * - metaTitle empty/null -> fallback to product name
 * - metaDescription present -> use metaDescription
 * - metaDescription empty/null -> fallback to truncated product description (160 chars)
 * - Both empty -> reasonable defaults
 *
 * These are unit tests for the SEO resolution logic extracted into a helper,
 * which is consumed by the product/[id].astro template.
 */

import { resolveProductSeo } from "../product-seo";

describe("T054: Product detail SEO meta tags", () => {
  it("should use metaTitle when provided", () => {
    const seo = resolveProductSeo({
      name: "Product Name",
      metaTitle: "Custom SEO Title",
    });
    expect(seo.title).toBe("Custom SEO Title");
  });

  it("should use metaDescription when provided", () => {
    const seo = resolveProductSeo({
      name: "Product Name",
      metaDescription: "Custom SEO description for the product page.",
    });
    expect(seo.description).toBe(
      "Custom SEO description for the product page.",
    );
  });

  it("should set ogTitle from metaTitle when provided", () => {
    const seo = resolveProductSeo({
      name: "Product Name",
      metaTitle: "OG SEO Title",
    });
    expect(seo.ogTitle).toBe("OG SEO Title");
  });

  it("should set ogDescription from metaDescription when provided", () => {
    const seo = resolveProductSeo({
      name: "Product Name",
      metaDescription: "OG SEO description.",
    });
    expect(seo.ogDescription).toBe("OG SEO description.");
  });
});

describe("T055: Fallback logic for empty SEO fields", () => {
  it("should fallback title to product name when metaTitle is null", () => {
    const seo = resolveProductSeo({
      name: "Awesome Product",
      metaTitle: null,
    });
    expect(seo.title).toBe("Awesome Product");
  });

  it("should fallback title to product name when metaTitle is undefined", () => {
    const seo = resolveProductSeo({
      name: "Awesome Product",
    });
    expect(seo.title).toBe("Awesome Product");
  });

  it("should fallback title to product name when metaTitle is empty string", () => {
    const seo = resolveProductSeo({
      name: "Awesome Product",
      metaTitle: "",
    });
    expect(seo.title).toBe("Awesome Product");
  });

  it("should fallback description to truncated product description when metaDescription is null", () => {
    const longDesc =
      "A".repeat(200) + " This part should be cut off because it exceeds 160 characters.";
    const seo = resolveProductSeo({
      name: "Product",
      description: longDesc,
      metaDescription: null,
    });
    expect(seo.description).toBe(longDesc.slice(0, 160));
    expect(seo.description!.length).toBe(160);
  });

  it("should fallback description to truncated product description when metaDescription is undefined", () => {
    const desc = "Short product description";
    const seo = resolveProductSeo({
      name: "Product",
      description: desc,
    });
    expect(seo.description).toBe(desc);
  });

  it("should fallback description to truncated product description when metaDescription is empty string", () => {
    const desc = "Product description here";
    const seo = resolveProductSeo({
      name: "Product",
      description: desc,
      metaDescription: "",
    });
    expect(seo.description).toBe(desc);
  });

  it("should return empty description when both metaDescription and description are missing", () => {
    const seo = resolveProductSeo({
      name: "Product",
    });
    expect(seo.description).toBe("");
  });

  it("should return empty description when both metaDescription and description are empty", () => {
    const seo = resolveProductSeo({
      name: "Product",
      description: "",
      metaDescription: "",
    });
    expect(seo.description).toBe("");
  });

  it("should fallback ogTitle to product name when metaTitle missing", () => {
    const seo = resolveProductSeo({
      name: "My Product",
    });
    expect(seo.ogTitle).toBe("My Product");
  });

  it("should fallback ogDescription to truncated description when metaDescription missing", () => {
    const longDesc = "B".repeat(200);
    const seo = resolveProductSeo({
      name: "Product",
      description: longDesc,
    });
    expect(seo.ogDescription).toBe(longDesc.slice(0, 160));
  });

  it("should truncate product description to exactly 160 characters for fallback", () => {
    const exactlyLong = "C".repeat(161);
    const seo = resolveProductSeo({
      name: "Product",
      description: exactlyLong,
    });
    expect(seo.description!.length).toBe(160);
    expect(seo.ogDescription!.length).toBe(160);
  });

  it("should NOT truncate metaDescription even if longer than 160 chars", () => {
    const longMeta = "D".repeat(250);
    const seo = resolveProductSeo({
      name: "Product",
      metaDescription: longMeta,
    });
    // metaDescription is intentionally set by user, don't truncate
    expect(seo.description).toBe(longMeta);
    expect(seo.ogDescription).toBe(longMeta);
  });

  it("should handle product name as fallback for title when metaTitle is whitespace", () => {
    const seo = resolveProductSeo({
      name: "Fallback Product",
      metaTitle: "   ",
    });
    expect(seo.title).toBe("Fallback Product");
  });

  it("should handle product description whitespace as empty for fallback", () => {
    const seo = resolveProductSeo({
      name: "Product",
      description: "   ",
      metaDescription: null,
    });
    expect(seo.description).toBe("");
  });

  it("should use 'Товар' as ultimate fallback when product name is also missing", () => {
    const seo = resolveProductSeo({
      name: "",
    });
    expect(seo.title).toBeTruthy();
  });
});
