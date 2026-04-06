/**
 * FragmentPatcher — calls the merfy-islands server to re-render island fragments
 * and writes the resulting HTML to MinIO for instant product updates.
 *
 * When a product update arrives for an island-enabled site, this service:
 * 1. POSTs to the islands server for each component (PopularProducts, ProductGrid)
 * 2. Writes the returned HTML to MinIO at sites/{storageSlug}/_islands/{component}.html
 * 3. Updates a manifest.json with fragment hashes for cache-busting
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { createHash } from "crypto";

/** Fragment components that need re-rendering on product updates */
const ISLAND_COMPONENTS = ["PopularProducts", "ProductGrid", "ProductDetail"] as const;

/** Manifest stored at {siteId}/_islands/manifest.json */
interface IslandsManifest {
  version: number;
  updatedAt: string;
  fragments: Record<
    string,
    {
      hash: string;
      updatedAt: string;
    }
  >;
}

@Injectable()
export class FragmentPatcher {
  private readonly logger = new Logger(FragmentPatcher.name);
  private readonly islandsServerUrl: string;
  private readonly minioClient: Minio.Client | null = null;
  private readonly bucketName: string;

  constructor(private readonly config: ConfigService) {
    this.islandsServerUrl =
      this.config.get<string>("ISLANDS_SERVER_URL") ||
      "https://islands.merfy.ru";

    this.bucketName =
      this.config.get<string>("S3_BUCKET") ||
      this.config.get<string>("S3_BUCKET_SITES") ||
      this.config.get<string>("MINIO_BUCKET") ||
      "merfy-sites";

    // Initialize MinIO client (same env pattern as S3StorageService)
    const endpoint =
      this.config.get<string>("S3_ENDPOINT") ||
      this.config.get<string>("MINIO_ENDPOINT") ||
      this.config.get<string>("MINIO_URL");
    const accessKey =
      this.config.get<string>("S3_ACCESS_KEY") ||
      this.config.get<string>("MINIO_ACCESS_KEY") ||
      this.config.get<string>("S3_ACCESS_KEY_ID");
    const secretKey =
      this.config.get<string>("S3_SECRET_KEY") ||
      this.config.get<string>("MINIO_SECRET_KEY") ||
      this.config.get<string>("S3_SECRET_ACCESS_KEY");

    if (endpoint && accessKey && secretKey) {
      try {
        const parsed = this.parseEndpoint(endpoint);
        this.minioClient = new Minio.Client({
          endPoint: parsed.host,
          port: parsed.port,
          useSSL: parsed.useSSL,
          accessKey,
          secretKey,
          region: this.config.get<string>("S3_REGION") || "us-east-1",
        });
        this.logger.log(
          `FragmentPatcher MinIO initialized: ${endpoint}, bucket: ${this.bucketName}`,
        );
      } catch (e) {
        this.logger.warn(
          `FragmentPatcher MinIO init failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    } else {
      this.logger.warn(
        "FragmentPatcher: MinIO env vars not set — fragment writes disabled",
      );
    }
  }

  private parseEndpoint(endpoint: string): {
    host: string;
    port: number;
    useSSL: boolean;
  } {
    try {
      const url = new URL(endpoint);
      return {
        host: url.hostname,
        port: url.port
          ? Number(url.port)
          : url.protocol === "https:"
            ? 443
            : 80,
        useSSL: url.protocol === "https:",
      };
    } catch {
      const [host, portRaw] = endpoint.split(":");
      const port = portRaw ? Number(portRaw) : 9000;
      return { host, port, useSSL: false };
    }
  }

  /**
   * Re-render island fragments for a site and write them to MinIO.
   * Uses batch endpoint (1 HTTP call) + hash comparison (skip unchanged).
   * Errors are caught and logged — never throws.
   */
  async patchFragments(siteId: string, tenantId: string, storageSlug?: string): Promise<void> {
    // storageSlug is the MinIO path prefix (e.g. "9c1c6fa8be34")
    // siteId is used for islands server requests, storageSlug for MinIO writes
    const slug = storageSlug ?? siteId;
    this.logger.log(
      `Patching fragments for site ${siteId} (tenant ${tenantId}, slug ${slug})`,
    );

    // 1. Read existing manifest for hash comparison
    const existingManifest = await this.readManifest(slug);

    // 2. Batch render all components (1 HTTP call instead of 3)
    let rendered: Record<string, string | null>;
    try {
      rendered = await this.batchRender(siteId);
    } catch (err) {
      this.logger.warn(
        `Batch render failed, falling back to sequential: ${err instanceof Error ? err.message : err}`,
      );
      rendered = await this.sequentialRender(siteId);
    }

    // 3. Hash-compare and write only changed fragments
    const updatedFragments: Record<
      string,
      { hash: string; updatedAt: string }
    > = {};

    for (const component of ISLAND_COMPONENTS) {
      const html = rendered[component];
      if (!html) continue;

      const hash = createHash("sha256")
        .update(html)
        .digest("hex")
        .slice(0, 8);

      // Skip if hash matches existing manifest
      if (existingManifest?.fragments[component]?.hash === hash) {
        this.logger.log(
          `Fragment ${component} unchanged for site ${siteId} (hash: ${hash}) — skipping write`,
        );
        continue;
      }

      try {
        await this.writeFragment(slug, component, html);
        updatedFragments[component] = {
          hash,
          updatedAt: new Date().toISOString(),
        };
        this.logger.log(
          `Fragment ${component} patched for site ${siteId} (hash: ${hash})`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to write fragment ${component} for site ${siteId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // 4. Update manifest only if something changed
    if (Object.keys(updatedFragments).length > 0) {
      try {
        await this.updateManifest(slug, updatedFragments);
      } catch (err) {
        this.logger.error(
          `Failed to update manifest for site ${siteId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      this.logger.log(`No fragments changed for site ${siteId} — 0 writes`);
    }
  }

  /**
   * Batch render all components in 1 HTTP call.
   */
  private async batchRender(
    storeId: string,
  ): Promise<Record<string, string | null>> {
    const url = `${this.islandsServerUrl}/islands/batch`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        components: [...ISLAND_COMPONENTS],
      }),
    });

    if (!response.ok) {
      throw new Error(`Batch render returned ${response.status}`);
    }

    return (await response.json()) as Record<string, string | null>;
  }

  /**
   * Fallback: render components sequentially (old behavior).
   */
  private async sequentialRender(
    storeId: string,
  ): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    for (const component of ISLAND_COMPONENTS) {
      result[component] = await this.renderFragment(component, storeId);
    }
    return result;
  }

  /**
   * Read existing manifest from MinIO (returns null if not found).
   */
  private async readManifest(siteId: string): Promise<IslandsManifest | null> {
    if (!this.minioClient) return null;

    const manifestKey = `sites/${siteId}/_islands/manifest.json`;
    try {
      const stream = await this.minioClient.getObject(
        this.bucketName,
        manifestKey,
      );
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      return null;
    }
  }

  /**
   * Call the islands server to render a component fragment.
   */
  private async renderFragment(
    component: string,
    storeId: string,
  ): Promise<string | null> {
    const url = `${this.islandsServerUrl}/islands/${component}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });

      if (!response.ok) {
        this.logger.warn(
          `Islands server returned ${response.status} for ${component}: ${await response.text().catch(() => "")}`,
        );
        return null;
      }

      return await response.text();
    } catch (err) {
      this.logger.error(
        `Failed to call islands server for ${component}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Write an HTML fragment to MinIO at {siteId}/_islands/{component}.html
   */
  private async writeFragment(
    siteId: string,
    component: string,
    html: string,
  ): Promise<void> {
    if (!this.minioClient) {
      this.logger.warn("MinIO client not available — skipping fragment write");
      return;
    }

    const key = `sites/${siteId}/_islands/${component}.html`;
    const buffer = Buffer.from(html, "utf-8");

    await this.minioClient.putObject(
      this.bucketName,
      key,
      buffer,
      buffer.length,
      {
        "Content-Type": "text/html; charset=utf-8",
      },
    );
  }

  /**
   * Read existing manifest.json from MinIO, merge updated fragments, write back.
   */
  private async updateManifest(
    siteId: string,
    updatedFragments: Record<string, { hash: string; updatedAt: string }>,
  ): Promise<void> {
    if (!this.minioClient) {
      this.logger.warn("MinIO client not available — skipping manifest update");
      return;
    }

    const manifestKey = `sites/${siteId}/_islands/manifest.json`;

    // Read existing manifest (or create new)
    let manifest: IslandsManifest;
    try {
      const stream = await this.minioClient.getObject(
        this.bucketName,
        manifestKey,
      );
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      manifest = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      // Manifest doesn't exist yet — create new
      manifest = { version: 1, updatedAt: "", fragments: {} };
    }

    // Merge updated fragments
    for (const [component, info] of Object.entries(updatedFragments)) {
      manifest.fragments[component] = info;
    }
    manifest.updatedAt = new Date().toISOString();

    // Write back
    const manifestJson = JSON.stringify(manifest, null, 2);
    const buffer = Buffer.from(manifestJson, "utf-8");
    await this.minioClient.putObject(
      this.bucketName,
      manifestKey,
      buffer,
      buffer.length,
      {
        "Content-Type": "application/json",
      },
    );

    this.logger.log(`Manifest updated for site ${siteId}`);
  }
}
