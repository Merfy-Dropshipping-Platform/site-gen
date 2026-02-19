import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { createHash } from "crypto";

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

/** Components to re-render on product updates */
const ISLAND_COMPONENTS = ["PopularProducts", "ProductGrid"];

@Injectable()
export class FragmentPatcher {
  private readonly logger = new Logger(FragmentPatcher.name);
  private readonly islandsServerUrl: string;
  private client: Minio.Client | null = null;
  private readonly bucketName: string;

  constructor(private readonly config: ConfigService) {
    this.islandsServerUrl =
      this.config.get<string>("ISLANDS_SERVER_URL") ??
      "https://islands.merfy.ru";

    this.bucketName =
      this.config.get<string>("S3_BUCKET") ??
      this.config.get<string>("S3_BUCKET_SITES") ??
      this.config.get<string>("MINIO_BUCKET") ??
      "merfy-sites";

    const endpoint =
      this.config.get<string>("S3_ENDPOINT") ??
      this.config.get<string>("MINIO_ENDPOINT") ??
      this.config.get<string>("MINIO_URL");
    const access =
      this.config.get<string>("S3_ACCESS_KEY") ??
      this.config.get<string>("MINIO_ACCESS_KEY") ??
      this.config.get<string>("S3_ACCESS_KEY_ID");
    const secret =
      this.config.get<string>("S3_SECRET_KEY") ??
      this.config.get<string>("MINIO_SECRET_KEY") ??
      this.config.get<string>("S3_SECRET_ACCESS_KEY");

    if (endpoint && access && secret) {
      try {
        const parsed = this.parseEndpoint(endpoint);
        this.client = new Minio.Client({
          endPoint: parsed.host,
          port: parsed.port,
          useSSL: parsed.useSSL,
          accessKey: access,
          secretKey: secret,
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
        "FragmentPatcher: MinIO credentials not configured, fragment writes will be skipped",
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
   * Patch island fragments for a site after product update.
   * Calls island server to re-render each component, writes HTML to MinIO,
   * and updates the manifest.
   */
  async patchFragments(siteId: string, tenantId: string): Promise<void> {
    this.logger.log(
      `Patching fragments for site ${siteId} (tenant ${tenantId})`,
    );

    if (!this.client) {
      this.logger.warn(
        `Skipping fragment patch for site ${siteId}: MinIO not configured`,
      );
      return;
    }

    const manifest = await this.readManifest(siteId);

    for (const component of ISLAND_COMPONENTS) {
      try {
        const html = await this.renderFragment(component, tenantId);
        if (!html) continue;

        const hash = createHash("sha256").update(html).digest("hex").slice(0, 8);

        await this.writeFragment(siteId, component, html);

        manifest.fragments[component] = {
          hash,
          updatedAt: new Date().toISOString(),
        };

        this.logger.log(
          `Patched fragment ${component} for site ${siteId} (hash: ${hash})`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to patch fragment ${component} for site ${siteId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    manifest.updatedAt = new Date().toISOString();
    await this.writeManifest(siteId, manifest);
  }

  /**
   * Call island server to render a component fragment.
   */
  private async renderFragment(
    component: string,
    storeId: string,
  ): Promise<string | null> {
    const url = `${this.islandsServerUrl}/islands/${component}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });

      if (!res.ok) {
        this.logger.warn(
          `Island server returned ${res.status} for ${component}: ${await res.text().catch(() => "")}`,
        );
        return null;
      }

      return await res.text();
    } catch (err) {
      this.logger.error(
        `Failed to call island server for ${component}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Write fragment HTML to MinIO at {siteId}/_islands/{component}.html
   */
  private async writeFragment(
    siteId: string,
    component: string,
    html: string,
  ): Promise<void> {
    const key = `sites/${siteId}/_islands/${component}.html`;
    const buffer = Buffer.from(html, "utf-8");
    await this.client!.putObject(this.bucketName, key, buffer, buffer.length, {
      "Content-Type": "text/html; charset=utf-8",
    });
  }

  /**
   * Read existing manifest from MinIO, or return a fresh one.
   */
  private async readManifest(siteId: string): Promise<IslandsManifest> {
    const key = `sites/${siteId}/_islands/manifest.json`;
    try {
      const stream = await this.client!.getObject(this.bucketName, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks).toString("utf-8");
      return JSON.parse(data) as IslandsManifest;
    } catch {
      // Manifest doesn't exist yet or is unreadable — start fresh
      return {
        version: 1,
        updatedAt: new Date().toISOString(),
        fragments: {},
      };
    }
  }

  /**
   * Write manifest.json to MinIO at {siteId}/_islands/manifest.json
   */
  private async writeManifest(
    siteId: string,
    manifest: IslandsManifest,
  ): Promise<void> {
    const key = `sites/${siteId}/_islands/manifest.json`;
    try {
      const json = JSON.stringify(manifest, null, 2);
      const buffer = Buffer.from(json, "utf-8");
      await this.client!.putObject(
        this.bucketName,
        key,
        buffer,
        buffer.length,
        { "Content-Type": "application/json" },
      );
      this.logger.log(`Updated manifest for site ${siteId}`);
    } catch (err) {
      this.logger.error(
        `Failed to write manifest for site ${siteId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
