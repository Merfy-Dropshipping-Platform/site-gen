import { Injectable, Logger } from '@nestjs/common';
import * as Minio from 'minio';

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private client: Minio.Client | null = null;
  private bucketName: string | null = null;
  private publicEndpoint: string | null = null;
  private region: string = 'us-east-1';

  constructor() {
    const endpoint =
      process.env.S3_ENDPOINT ||
      process.env.MINIO_ENDPOINT ||
      process.env.MINIO_URL;
    const access =
      process.env.S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID;
    const secret =
      process.env.S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || process.env.S3_SECRET_ACCESS_KEY;
    const bucket =
      process.env.S3_BUCKET || process.env.S3_BUCKET_SITES || process.env.MINIO_BUCKET;
    this.publicEndpoint =
      process.env.S3_PUBLIC_ENDPOINT || process.env.MINIO_PUBLIC_ENDPOINT || null;
    this.region = process.env.S3_REGION || 'us-east-1';

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
      } catch (e) {
        this.logger.warn(`S3/Minio init failed: ${e instanceof Error ? e.message : e}`);
        this.client = null;
        this.bucketName = null;
      }
    }
  }

  private parseEndpoint(endpoint: string): { host: string; port: number; useSSL: boolean } {
    try {
      const url = new URL(endpoint);
      return {
        host: url.hostname,
        port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
        useSSL: url.protocol === 'https:',
      };
    } catch {
      // Если строка без протокола, считаем её hostname:port
      const [host, portRaw] = endpoint.split(':');
      const port = portRaw ? Number(portRaw) : 9000;
      return { host, port, useSSL: false };
    }
  }

  async isEnabled() {
    return Boolean(this.client && this.bucketName);
  }

  async ensureBucket() {
    if (!this.client || !this.bucketName) throw new Error('S3 not configured');
    const exists = await this.client.bucketExists(this.bucketName).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucketName, this.region);
    }
    return this.bucketName;
  }

  async uploadFile(bucket: string, key: string, filePath: string) {
    if (!this.client) throw new Error('S3 client not initialized');
    await this.client.fPutObject(bucket, key, filePath, {});
    const endpoint = this.publicEndpoint || process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT;
    if (endpoint) {
      const base = endpoint.replace(/\/$/, '');
      return `${base}/${bucket}/${key}`;
    }
    return `s3://${bucket}/${key}`;
  }

  async removePrefix(bucket: string, prefix: string) {
    if (!this.client) throw new Error('S3 client not initialized');
    const objectsStream = this.client.listObjectsV2(bucket, prefix, true);
    const keys: string[] = await new Promise((resolve, reject) => {
      const arr: string[] = [];
      objectsStream.on('data', (obj: any) => {
        if (obj?.name) arr.push(obj.name);
      });
      objectsStream.on('end', () => resolve(arr));
      objectsStream.on('error', reject);
    });
    if (keys.length === 0) return { removed: 0 } as const;
    await this.client.removeObjects(bucket, keys);
    return { removed: keys.length } as const;
  }

  async removeObject(bucket: string, key: string) {
    if (!this.client) throw new Error('S3 client not initialized');
    await this.client.removeObject(bucket, key);
    return { removed: 1 } as const;
  }
}
