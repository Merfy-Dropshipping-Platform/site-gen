var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var S3StorageService_1;
import { Injectable, Logger } from '@nestjs/common';
import * as Minio from 'minio';
let S3StorageService = S3StorageService_1 = class S3StorageService {
    constructor() {
        this.logger = new Logger(S3StorageService_1.name);
        this.client = null;
        this.bucketName = null;
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
            }
            catch (e) {
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
        if (!this.client || !this.bucketName)
            throw new Error('S3 not configured');
        const exists = await this.client.bucketExists(this.bucketName).catch(() => false);
        if (!exists) {
            await this.client.makeBucket(this.bucketName, process.env.S3_REGION || 'us-east-1');
        }
        return this.bucketName;
    }
    async uploadFile(bucket, key, filePath) {
        if (!this.client)
            throw new Error('S3 client not initialized');
        await this.client.fPutObject(bucket, key, filePath, {});
        const endpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT;
        if (endpoint) {
            const base = endpoint.replace(/\/$/, '');
            return `${base}/${bucket}/${key}`;
        }
        return `s3://${bucket}/${key}`;
    }
    async removePrefix(bucket, prefix) {
        if (!this.client)
            throw new Error('S3 client not initialized');
        const objectsStream = this.client.listObjectsV2(bucket, prefix, true);
        const keys = await new Promise((resolve, reject) => {
            const arr = [];
            objectsStream.on('data', (obj) => {
                if (obj?.name)
                    arr.push(obj.name);
            });
            objectsStream.on('end', () => resolve(arr));
            objectsStream.on('error', reject);
        });
        if (keys.length === 0)
            return { removed: 0 };
        await this.client.removeObjects(bucket, keys);
        return { removed: keys.length };
    }
    async removeObject(bucket, key) {
        if (!this.client)
            throw new Error('S3 client not initialized');
        await this.client.removeObject(bucket, key);
        return { removed: 1 };
    }
};
S3StorageService = S3StorageService_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [])
], S3StorageService);
export { S3StorageService };
//# sourceMappingURL=s3.service.js.map