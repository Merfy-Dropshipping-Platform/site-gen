/**
 * Tests for FragmentPatcher (fragment-patcher.service.ts)
 *
 * Validates:
 * - T019: ISLAND_COMPONENTS includes PopularProducts, ProductGrid, ProductDetail
 * - Each component gets rendered via islands server and written to MinIO
 * - Manifest is updated with all patched fragments
 * - Errors in one component don't block others
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock minio
const mockPutObject = jest.fn().mockResolvedValue(undefined);
const mockGetObject = jest.fn();

jest.mock("minio", () => ({
  Client: jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    getObject: mockGetObject,
  })),
}));

import { FragmentPatcher } from "../fragment-patcher.service";

function mockConfigService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    ISLANDS_SERVER_URL: "https://islands.merfy.ru",
    S3_BUCKET: "merfy-sites",
    S3_ENDPOINT: "https://minio.merfy.ru",
    S3_ACCESS_KEY: "test-key",
    S3_SECRET_KEY: "test-secret",
    S3_REGION: "us-east-1",
  };
  const values = { ...defaults, ...overrides };
  return {
    get: jest.fn((key: string) => values[key]),
  } as any;
}

describe("FragmentPatcher", () => {
  let patcher: FragmentPatcher;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: fetch returns HTML, getObject throws (no existing manifest)
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<div>rendered</div>"),
    });
    mockGetObject.mockRejectedValue(new Error("NoSuchKey"));
    patcher = new FragmentPatcher(mockConfigService());
  });

  describe("T019: ISLAND_COMPONENTS includes ProductGrid and ProductDetail", () => {
    it("should call islands server for PopularProducts", async () => {
      await patcher.patchFragments("site-1", "tenant-1");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://islands.merfy.ru/islands/PopularProducts",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should call islands server for ProductGrid", async () => {
      await patcher.patchFragments("site-1", "tenant-1");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://islands.merfy.ru/islands/ProductGrid",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should call islands server for ProductDetail", async () => {
      await patcher.patchFragments("site-1", "tenant-1");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://islands.merfy.ru/islands/ProductDetail",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should call islands server for all 3 components", async () => {
      await patcher.patchFragments("site-1", "tenant-1");

      // Should be called 3 times: PopularProducts, ProductGrid, ProductDetail
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should write each fragment to MinIO at correct path", async () => {
      await patcher.patchFragments("site-1", "tenant-1");

      const writtenPaths = mockPutObject.mock.calls.map(
        (call: any[]) => call[1],
      );
      expect(writtenPaths).toContain(
        "sites/site-1/_islands/PopularProducts.html",
      );
      expect(writtenPaths).toContain("sites/site-1/_islands/ProductGrid.html");
      expect(writtenPaths).toContain(
        "sites/site-1/_islands/ProductDetail.html",
      );
    });

    it("should update manifest with all 3 fragments", async () => {
      await patcher.patchFragments("site-1", "tenant-1");

      // Find the manifest write call (manifest.json)
      const manifestCall = mockPutObject.mock.calls.find(
        (call: any[]) =>
          typeof call[1] === "string" && call[1].includes("manifest.json"),
      );
      expect(manifestCall).toBeDefined();

      // Parse the manifest content
      const manifestBuffer = manifestCall![2] as Buffer;
      const manifest = JSON.parse(manifestBuffer.toString("utf-8"));

      expect(manifest.fragments).toHaveProperty("PopularProducts");
      expect(manifest.fragments).toHaveProperty("ProductGrid");
      expect(manifest.fragments).toHaveProperty("ProductDetail");
    });

    it("should continue patching other components when one fails", async () => {
      // First call (PopularProducts) fails, others succeed
      mockFetch
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValue({
          ok: true,
          text: () => Promise.resolve("<div>rendered</div>"),
        });

      await patcher.patchFragments("site-1", "tenant-1");

      // Should still have written the 2 successful fragments
      const writtenPaths = mockPutObject.mock.calls
        .filter(
          (call: any[]) =>
            typeof call[1] === "string" && call[1].endsWith(".html"),
        )
        .map((call: any[]) => call[1]);
      expect(writtenPaths.length).toBe(2);
    });
  });
});
