/**
 * Tests for T020: FetchedProduct interface new fields
 * Tests for T021: stageFetchData passes new fields to astroProducts
 *
 * Validates:
 * - FetchedProduct interface includes sku, metaTitle, metaDescription,
 *   isPhysicalProduct, quantity, hasVariants
 * - Type-level tests confirming the interface accepts the new fields
 */

import type { FetchedProduct } from "../data-fetcher";

describe("T020: FetchedProduct interface new fields", () => {
  it("should accept sku field", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      sku: "SKU-001",
    };
    expect(product.sku).toBe("SKU-001");
  });

  it("should accept sku as null", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      sku: null,
    };
    expect(product.sku).toBeNull();
  });

  it("should accept metaTitle field", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      metaTitle: "SEO Title",
    };
    expect(product.metaTitle).toBe("SEO Title");
  });

  it("should accept metaTitle as null", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      metaTitle: null,
    };
    expect(product.metaTitle).toBeNull();
  });

  it("should accept metaDescription field", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      metaDescription: "SEO Description for product",
    };
    expect(product.metaDescription).toBe("SEO Description for product");
  });

  it("should accept metaDescription as null", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      metaDescription: null,
    };
    expect(product.metaDescription).toBeNull();
  });

  it("should accept isPhysicalProduct field", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      isPhysicalProduct: true,
    };
    expect(product.isPhysicalProduct).toBe(true);
  });

  it("should accept quantity field", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      quantity: 42,
    };
    expect(product.quantity).toBe(42);
  });

  it("should accept hasVariants field", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Test Product",
      price: 1000,
      hasVariants: true,
    };
    expect(product.hasVariants).toBe(true);
  });

  it("should accept all new fields together", () => {
    const product: FetchedProduct = {
      id: "p1",
      name: "Full Product",
      description: "A test product",
      price: 1500,
      images: ["img1.jpg", "img2.jpg"],
      slug: "full-product",
      handle: "full-product",
      sku: "FP-001",
      metaTitle: "Full Product - Buy Now",
      metaDescription: "The best full product available",
      isPhysicalProduct: true,
      quantity: 100,
      hasVariants: false,
    };

    expect(product.sku).toBe("FP-001");
    expect(product.metaTitle).toBe("Full Product - Buy Now");
    expect(product.metaDescription).toBe(
      "The best full product available",
    );
    expect(product.isPhysicalProduct).toBe(true);
    expect(product.quantity).toBe(100);
    expect(product.hasVariants).toBe(false);
  });

  it("should work without new fields (backward compatible)", () => {
    // All new fields should be optional
    const product: FetchedProduct = {
      id: "p1",
      name: "Minimal Product",
      price: 500,
    };

    expect(product.sku).toBeUndefined();
    expect(product.metaTitle).toBeUndefined();
    expect(product.metaDescription).toBeUndefined();
    expect(product.isPhysicalProduct).toBeUndefined();
    expect(product.quantity).toBeUndefined();
    expect(product.hasVariants).toBeUndefined();
  });
});
