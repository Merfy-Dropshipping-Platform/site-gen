import { Injectable, Logger } from "@nestjs/common";
import * as Minio from "minio";

/**
 * S3StorageService — сервис для работы с S3/MinIO хранилищем статики сайтов.
 *
 * Статика сайтов хранится в публичном bucket и раздаётся напрямую из MinIO.
 * URL файлов: ${S3_PUBLIC_ENDPOINT}/${bucket}/sites/{tenantId}/{siteId}/...
 *
 * Переменные окружения:
 * - S3_ENDPOINT / MINIO_ENDPOINT — внутренний endpoint для записи (http://minio:9000)
 * - S3_PUBLIC_ENDPOINT — публичный endpoint для URL (https://s3.merfy.ru)
 * - S3_BUCKET — имя bucket (merfy-sites)
 * - S3_ACCESS_KEY / S3_SECRET_KEY — credentials
 */
@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private client: Minio.Client | null = null;
  private bucketName: string | null = null;
  private publicEndpoint: string | null = null;
  private internalEndpoint: string | null = null;
  private region: string = "us-east-1";

  constructor() {
    const endpoint =
      process.env.S3_ENDPOINT ||
      process.env.MINIO_ENDPOINT ||
      process.env.MINIO_URL;
    const access =
      process.env.S3_ACCESS_KEY ||
      process.env.MINIO_ACCESS_KEY ||
      process.env.S3_ACCESS_KEY_ID;
    const secret =
      process.env.S3_SECRET_KEY ||
      process.env.MINIO_SECRET_KEY ||
      process.env.S3_SECRET_ACCESS_KEY;
    const bucket =
      process.env.S3_BUCKET ||
      process.env.S3_BUCKET_SITES ||
      process.env.MINIO_BUCKET ||
      "merfy-sites";
    this.publicEndpoint =
      process.env.S3_PUBLIC_ENDPOINT ||
      process.env.MINIO_API_URL ||
      process.env.MINIO_PUBLIC_ENDPOINT ||
      null;
    this.internalEndpoint = endpoint || null;
    this.region = process.env.S3_REGION || "us-east-1";

    if (endpoint && access && secret && bucket) {
      try {
        const parsed = this.parseEndpoint(endpoint);
        this.client = new Minio.Client({
          endPoint: parsed.host,
          port: parsed.port,
          useSSL: parsed.useSSL,
          accessKey: access,
          secretKey: secret,
          region: this.region,
        });
        this.bucketName = bucket;
        this.logger.log(`S3/MinIO initialized: ${endpoint}, bucket: ${bucket}`);
      } catch (e) {
        this.logger.warn(
          `S3/Minio init failed: ${e instanceof Error ? e.message : e}`,
        );
        this.client = null;
        this.bucketName = null;
      }
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
      // Если строка без протокола, считаем её hostname:port
      const [host, portRaw] = endpoint.split(":");
      const port = portRaw ? Number(portRaw) : 9000;
      return { host, port, useSSL: false };
    }
  }

  async isEnabled() {
    return Boolean(this.client && this.bucketName);
  }

  async ensureBucket() {
    if (!this.client || !this.bucketName) throw new Error("S3 not configured");
    const exists = await this.client
      .bucketExists(this.bucketName)
      .catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucketName, this.region);
      this.logger.log(`Created bucket: ${this.bucketName}`);
      // Установить публичную политику для раздачи статики
      await this.setPublicReadPolicy(this.bucketName);
    }
    return this.bucketName;
  }

  /**
   * Установить публичную политику на bucket для раздачи статики.
   * Разрешает анонимный доступ на чтение для prefix sites/*
   */
  private async setPublicReadPolicy(bucket: string) {
    if (!this.client) return;

    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadSites",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${bucket}/sites/*`],
        },
      ],
    };

    try {
      await this.client.setBucketPolicy(bucket, JSON.stringify(policy));
      this.logger.log(`Set public read policy on bucket ${bucket} for sites/*`);
    } catch (e) {
      this.logger.warn(
        `Failed to set bucket policy: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async uploadFile(bucket: string, key: string, filePath: string) {
    if (!this.client) throw new Error("S3 client not initialized");
    await this.client.fPutObject(bucket, key, filePath, {});
    return this.getPublicUrl(bucket, key);
  }

  /**
   * Получить публичный URL для файла.
   * Использует S3_PUBLIC_ENDPOINT если настроен, иначе внутренний endpoint.
   */
  getPublicUrl(bucket: string, key: string): string {
    const endpoint = this.publicEndpoint || this.internalEndpoint;
    if (endpoint) {
      const base = endpoint.replace(/\/$/, "");
      return `${base}/${bucket}/${key}`;
    }
    return `s3://${bucket}/${key}`;
  }

  /**
   * Получить публичный URL для сайта (index.html).
   * Используется для publicUrl сайта после публикации.
   * @deprecated Использовать getSitePublicUrlBySubdomain для новых сайтов
   */
  getSitePublicUrl(tenantId: string, siteId: string): string | null {
    if (!this.bucketName) return null;
    const endpoint = this.publicEndpoint || this.internalEndpoint;
    if (!endpoint) return null;
    const base = endpoint.replace(/\/$/, "");
    return `${base}/${this.bucketName}/sites/${tenantId}/${siteId}/index.html`;
  }

  /**
   * Получить базовый URL для статики сайта (без index.html).
   * @deprecated Использовать getSitePrefixBySubdomain для новых сайтов
   */
  getSiteBaseUrl(tenantId: string, siteId: string): string | null {
    if (!this.bucketName) return null;
    const endpoint = this.publicEndpoint || this.internalEndpoint;
    if (!endpoint) return null;
    const base = endpoint.replace(/\/$/, "");
    return `${base}/${this.bucketName}/sites/${tenantId}/${siteId}/`;
  }

  /**
   * Извлечь slug из поддомена (abc123.merfy.ru → abc123)
   */
  extractSubdomainSlug(subdomain: string): string {
    // Убираем протокол если есть
    let domain = subdomain.replace(/^https?:\/\//, "");
    // Убираем trailing slash
    domain = domain.replace(/\/$/, "");
    // Берём первую часть до точки (abc123.merfy.ru → abc123)
    return domain.split(".")[0];
  }

  /**
   * Получить S3 prefix для сайта по поддомену.
   * Новый формат: sites/{subdomain-slug}/
   */
  getSitePrefixBySubdomain(subdomain: string): string {
    const slug = this.extractSubdomainSlug(subdomain);
    return `sites/${slug}/`;
  }

  /**
   * Получить публичный URL для сайта по поддомену.
   * URL вида: https://{subdomain}.merfy.ru (раздаётся через reverse proxy → MinIO)
   */
  getSitePublicUrlBySubdomain(subdomain: string): string {
    const slug = this.extractSubdomainSlug(subdomain);
    // Публичный URL - это сам поддомен (reverse proxy раздаёт из MinIO)
    return `https://${slug}.merfy.ru`;
  }

  /**
   * Получить S3 URL для статики сайта (для отладки/прямого доступа).
   */
  getSiteS3Url(subdomain: string): string | null {
    if (!this.bucketName) return null;
    const endpoint = this.publicEndpoint || this.internalEndpoint;
    if (!endpoint) return null;
    const base = endpoint.replace(/\/$/, "");
    const slug = this.extractSubdomainSlug(subdomain);
    return `${base}/${this.bucketName}/sites/${slug}/index.html`;
  }

  async removePrefix(bucket: string, prefix: string) {
    if (!this.client) throw new Error("S3 client not initialized");
    const objectsStream = this.client.listObjectsV2(bucket, prefix, true);
    const keys: string[] = await new Promise((resolve, reject) => {
      const arr: string[] = [];
      objectsStream.on("data", (obj: any) => {
        if (obj?.name) arr.push(obj.name);
      });
      objectsStream.on("end", () => resolve(arr));
      objectsStream.on("error", reject);
    });
    if (keys.length === 0) return { removed: 0 } as const;
    await this.client.removeObjects(bucket, keys);
    return { removed: keys.length } as const;
  }

  async removeObject(bucket: string, key: string) {
    if (!this.client) throw new Error("S3 client not initialized");
    await this.client.removeObject(bucket, key);
    return { removed: 1 } as const;
  }

  /**
   * Загрузить директорию в S3 рекурсивно.
   * Используется для загрузки статики сайта (dist/) напрямую.
   *
   * @param bucket - имя bucket
   * @param prefix - префикс ключа (например sites/tenant/site/)
   * @param localDir - локальная директория для загрузки
   * @returns количество загруженных файлов
   */
  async uploadDirectory(
    bucket: string,
    prefix: string,
    localDir: string,
  ): Promise<{ uploaded: number }> {
    if (!this.client) throw new Error("S3 client not initialized");

    const fs = await import("fs/promises");
    const path = await import("path");

    let uploaded = 0;

    const uploadRecursive = async (dir: string, keyPrefix: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const localPath = path.join(dir, entry.name);
        const s3Key = `${keyPrefix}${entry.name}`;

        if (entry.isDirectory()) {
          await uploadRecursive(localPath, `${s3Key}/`);
        } else if (entry.isFile()) {
          await this.client!.fPutObject(bucket, s3Key, localPath, {
            "Content-Type": this.getContentType(entry.name),
          });
          uploaded++;
        }
      }
    };

    await uploadRecursive(localDir, prefix);
    this.logger.log(`Uploaded ${uploaded} files to s3://${bucket}/${prefix}`);
    return { uploaded };
  }

  /**
   * Определить Content-Type по расширению файла.
   */
  private getContentType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      html: "text/html",
      htm: "text/html",
      css: "text/css",
      js: "application/javascript",
      mjs: "application/javascript",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      webp: "image/webp",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      eot: "application/vnd.ms-fontobject",
      xml: "application/xml",
      txt: "text/plain",
      md: "text/markdown",
      pdf: "application/pdf",
    };
    return types[ext ?? ""] || "application/octet-stream";
  }

  /**
   * Проверка доступности MinIO/S3.
   * Используется для health check сервиса.
   */
  async healthCheck(): Promise<{
    status: "up" | "down";
    latencyMs: number;
    error?: string;
  }> {
    const start = Date.now();
    if (!this.client || !this.bucketName) {
      return {
        status: "down",
        latencyMs: Date.now() - start,
        error: "S3 not configured",
      };
    }

    try {
      // Проверяем что bucket существует
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        return {
          status: "down",
          latencyMs: Date.now() - start,
          error: `Bucket ${this.bucketName} does not exist`,
        };
      }
      return { status: "up", latencyMs: Date.now() - start };
    } catch (e) {
      return {
        status: "down",
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : "unknown",
      };
    }
  }

  /**
   * Проверить наличие файлов сайта в MinIO.
   * Используется для health check конкретного сайта.
   *
   * @param sitePrefix - префикс сайта (например sites/abc123/)
   * @returns информация о файлах сайта
   */
  async checkSiteFiles(sitePrefix: string): Promise<{
    exists: boolean;
    hasIndex: boolean;
    fileCount: number;
    totalSize: number;
    files: string[];
    error?: string;
  }> {
    if (!this.client || !this.bucketName) {
      return {
        exists: false,
        hasIndex: false,
        fileCount: 0,
        totalSize: 0,
        files: [],
        error: "S3 not configured",
      };
    }

    try {
      const objectsStream = this.client.listObjectsV2(
        this.bucketName,
        sitePrefix,
        true,
      );

      const files: string[] = [];
      let totalSize = 0;
      let hasIndex = false;

      await new Promise<void>((resolve, reject) => {
        objectsStream.on("data", (obj: Minio.BucketItem) => {
          if (obj?.name) {
            files.push(obj.name);
            totalSize += obj.size || 0;
            // Проверяем наличие index.html
            if (obj.name.endsWith("index.html")) {
              hasIndex = true;
            }
          }
        });
        objectsStream.on("end", () => resolve());
        objectsStream.on("error", reject);
      });

      return {
        exists: files.length > 0,
        hasIndex,
        fileCount: files.length,
        totalSize,
        files: files.slice(0, 20), // Возвращаем первые 20 файлов
      };
    } catch (e) {
      return {
        exists: false,
        hasIndex: false,
        fileCount: 0,
        totalSize: 0,
        files: [],
        error: e instanceof Error ? e.message : "unknown",
      };
    }
  }

  /**
   * Проверить существование конкретного файла в MinIO.
   * Быстрая проверка для health check.
   */
  async fileExists(key: string): Promise<boolean> {
    if (!this.client || !this.bucketName) return false;

    try {
      await this.client.statObject(this.bucketName, key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Получить имя bucket.
   */
  getBucketName(): string | null {
    return this.bucketName;
  }

  /**
   * Upload build artifact zip to S3: sites/{siteId}/{buildId}/artifact.zip
   *
   * @returns public URL of the uploaded artifact
   */
  async uploadArtifact(
    siteId: string,
    buildId: string,
    zipPath: string,
  ): Promise<string> {
    const bucket = await this.ensureBucket();
    const key = `sites/${siteId}/${buildId}/artifact.zip`;
    return this.uploadFile(bucket, key, zipPath);
  }

  /**
   * Upload static files from a dist directory to S3 for direct serving.
   * Files are uploaded to sites/{siteId}/{buildId}/ prefix.
   * Also updates the "live" prefix at sites/{siteId}/ for current serving.
   *
   * @returns number of uploaded files and the live prefix URL
   */
  async uploadStaticFiles(
    siteId: string,
    buildId: string,
    distDir: string,
  ): Promise<{ uploaded: number; livePrefix: string }> {
    const bucket = await this.ensureBucket();

    // Upload to build-specific prefix (archive)
    const buildPrefix = `sites/${siteId}/${buildId}/`;
    await this.uploadDirectory(bucket, buildPrefix, distDir);

    // Upload to live prefix (overwrite current serving files)
    const livePrefix = `sites/${siteId}/`;
    await this.removePrefix(bucket, livePrefix).catch(() => {});
    const { uploaded } = await this.uploadDirectory(
      bucket,
      livePrefix,
      distDir,
    );

    this.logger.log(
      `Uploaded ${uploaded} static files for site ${siteId}, build ${buildId}`,
    );

    return { uploaded, livePrefix: this.getPublicUrl(bucket, livePrefix) };
  }
}
