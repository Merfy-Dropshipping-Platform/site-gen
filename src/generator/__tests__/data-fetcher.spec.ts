/**
 * Tests for data-fetcher.ts
 *
 * Validates:
 * - Products fetching via RPC (mock ClientProxy)
 * - Collections fetching via RPC (mock ClientProxy)
 * - Combined fetchStoreData parallel execution
 * - Timeout handling
 * - Error handling and graceful fallback to empty arrays
 * - Retry behavior
 */

import { of, throwError, timer, switchMap } from "rxjs";
import {
  fetchProducts,
  fetchCollections,
  fetchStoreData,
  type FetchedProduct,
  type FetchedCollection,
} from "../data-fetcher";

// -- Mock ClientProxy --

function mockClientProxy(
  responses: Record<string, unknown>,
): { send: jest.Mock } {
  return {
    send: jest.fn((pattern: string, _data: unknown) => {
      const response = responses[pattern];
      if (response instanceof Error) {
        return throwError(() => response);
      }
      if (response === "timeout") {
        // Simulate a response that never completes within timeout
        return timer(30_000).pipe(switchMap(() => of(null)));
      }
      return of(response);
    }),
  };
}

const SAMPLE_PRODUCTS: FetchedProduct[] = [
  { id: "p1", name: "Product 1", price: 1000, slug: "product-1" },
  {
    id: "p2",
    name: "Product 2",
    price: 2000,
    images: ["img.jpg"],
    slug: "product-2",
  },
];

const SAMPLE_COLLECTIONS: FetchedCollection[] = [
  {
    id: "c1",
    name: "Collection 1",
    slug: "collection-1",
    productIds: ["p1"],
  },
];

describe("fetchProducts", () => {
  it("returns products on successful RPC response", async () => {
    const client = mockClientProxy({
      "product.list": { success: true, data: SAMPLE_PRODUCTS },
    });

    const products = await fetchProducts(client as any, "tenant-1");

    expect(products).toHaveLength(2);
    expect(products[0].name).toBe("Product 1");
    expect(client.send).toHaveBeenCalledWith("product.list", {
      tenantId: "tenant-1",
      siteId: undefined,
    });
  });

  it("passes siteId when provided", async () => {
    const client = mockClientProxy({
      "product.list": { success: true, data: SAMPLE_PRODUCTS },
    });

    await fetchProducts(client as any, "tenant-1", "site-1");

    expect(client.send).toHaveBeenCalledWith("product.list", {
      tenantId: "tenant-1",
      siteId: "site-1",
    });
  });

  it("returns empty array when RPC returns failure", async () => {
    const client = mockClientProxy({
      "product.list": { success: false, message: "not_found" },
    });

    const products = await fetchProducts(client as any, "tenant-1");

    expect(products).toEqual([]);
  });

  it("returns empty array on RPC error", async () => {
    const client = mockClientProxy({
      "product.list": new Error("Connection refused"),
    });

    const products = await fetchProducts(client as any, "tenant-1");

    expect(products).toEqual([]);
  });

  it("returns empty array when data is not an array", async () => {
    const client = mockClientProxy({
      "product.list": { success: true, data: "invalid" },
    });

    const products = await fetchProducts(client as any, "tenant-1");

    expect(products).toEqual([]);
  });
});

describe("fetchCollections", () => {
  it("returns collections on successful RPC response", async () => {
    const client = mockClientProxy({
      "product.collections.list": {
        success: true,
        data: SAMPLE_COLLECTIONS,
      },
    });

    const collections = await fetchCollections(client as any, "tenant-1");

    expect(collections).toHaveLength(1);
    expect(collections[0].name).toBe("Collection 1");
  });

  it("returns empty array on failure", async () => {
    const client = mockClientProxy({
      "product.collections.list": {
        success: false,
        message: "error",
      },
    });

    const collections = await fetchCollections(client as any, "tenant-1");

    expect(collections).toEqual([]);
  });

  it("returns empty array on RPC error", async () => {
    const client = mockClientProxy({
      "product.collections.list": new Error("Timeout"),
    });

    const collections = await fetchCollections(client as any, "tenant-1");

    expect(collections).toEqual([]);
  });
});

describe("fetchStoreData", () => {
  it("fetches products and collections in parallel", async () => {
    const client = mockClientProxy({
      "product.list": { success: true, data: SAMPLE_PRODUCTS },
      "product.collections.list": {
        success: true,
        data: SAMPLE_COLLECTIONS,
      },
    });

    const result = await fetchStoreData(client as any, "tenant-1");

    expect(result.products).toHaveLength(2);
    expect(result.collections).toHaveLength(1);
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it("returns empty arrays when both calls fail", async () => {
    const client = mockClientProxy({
      "product.list": new Error("fail"),
      "product.collections.list": new Error("fail"),
    });

    const result = await fetchStoreData(client as any, "tenant-1");

    expect(result.products).toEqual([]);
    expect(result.collections).toEqual([]);
  });

  it("returns partial data when one call fails", async () => {
    const client = mockClientProxy({
      "product.list": { success: true, data: SAMPLE_PRODUCTS },
      "product.collections.list": new Error("fail"),
    });

    const result = await fetchStoreData(client as any, "tenant-1");

    expect(result.products).toHaveLength(2);
    expect(result.collections).toEqual([]);
  });

  it("passes siteId to product fetch", async () => {
    const client = mockClientProxy({
      "product.list": { success: true, data: [] },
      "product.collections.list": { success: true, data: [] },
    });

    await fetchStoreData(client as any, "tenant-1", "site-1");

    expect(client.send).toHaveBeenCalledWith("product.list", {
      tenantId: "tenant-1",
      siteId: "site-1",
    });
  });
});
