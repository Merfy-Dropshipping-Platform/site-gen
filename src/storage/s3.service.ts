import { Injectable, Logger } from '@nestjs/common';
import * as Minio from 'minio';

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private client: Minio.Client | null = null;
  private bucketName: string | null = null;

  constructor() {
    const endp = process.env.S3_ENDPOINT;
    const access = process.env.S3_ACCESS_KEY;
    const secret = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;
    if (endp && access && secret && bucket) {
      try {
        const url = new URL(endp);
        this.client = new Minio.Client({
          endPoint: url.hostname,
          port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
          useSSL: url.protocol === 'https:',
          accessKey: access,
          secretKey: secret,
          region: process.env.S3_REGION || 'us-east-1',
        });
        this.bucketName = bucket;
      } catch (e) {
        this.logger.warn(`S3 init failed: ${e instanceof Error ? e.message : e}`);
        this.client = null;
        this.bucketName = null;
      }
    }
  }

  async isEnabled() {
    return Boolean(this.client && this.bucketName);
  }

  async ensureBucket() {
    if (!this.client || !this.bucketName) throw new Error('S3 not configured');
    const exists = await this.client.bucketExists(this.bucketName).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucketName, process.env.S3_REGION || 'us-east-1');
    }
    return this.bucketName;
  }

  async uploadFile(bucket: string, key: string, filePath: string) {
    if (!this.client) throw new Error('S3 client not initialized');
    await this.client.fPutObject(bucket, key, filePath, {});
    const endpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT;
    if (endpoint) {
      const base = endpoint.replace(/\/$/, '');
      // Если Minio расположен за прокси, PUBLIC_ENDPOINT может указывать на CDN/HTTP адрес
      return `${base}/${bucket}/${key}`;
    }
    // Fallback на s3:// URL
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
    // MinIO allows batch removal via removeObjects
    await this.client.removeObjects(bucket, keys);
    return { removed: keys.length } as const;
  }

  async removeObject(bucket: string, key: string) {
    if (!this.client) throw new Error('S3 client not initialized');
    await this.client.removeObject(bucket, key);
    return { removed: 1 } as const;
  }
}
