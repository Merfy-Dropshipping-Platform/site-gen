var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RetentionScheduler_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PG_CONNECTION } from '../constants';
import * as schema from '../db/schema';
import { and, isNotNull, lt } from 'drizzle-orm';
import * as fs from 'fs/promises';
import { S3StorageService } from '../storage/s3.service';
let RetentionScheduler = RetentionScheduler_1 = class RetentionScheduler {
    constructor(db, storage) {
        this.db = db;
        this.storage = storage;
        this.logger = new Logger(RetentionScheduler_1.name);
    }
    async cleanupArtifacts() {
        const days = Number.parseInt(String(process.env.ARTIFACT_RETENTION_DAYS ?? 14), 10);
        if (!Number.isFinite(days) || days <= 0)
            return;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        this.logger.log(`Retention job: removing artifacts older than ${days}d`);
        const rows = await this.db
            .select({
            id: schema.siteBuild.id,
            siteId: schema.siteBuild.siteId,
            artifactUrl: schema.siteBuild.artifactUrl,
            s3Bucket: schema.siteBuild.s3Bucket,
            s3KeyPrefix: schema.siteBuild.s3KeyPrefix,
            completedAt: schema.siteBuild.completedAt,
        })
            .from(schema.siteBuild)
            .where(and(isNotNull(schema.siteBuild.completedAt), lt(schema.siteBuild.completedAt, cutoff)));
        for (const r of rows) {
            if (r.artifactUrl?.startsWith('file://')) {
                try {
                    const localPath = r.artifactUrl.replace('file://', '');
                    await fs.rm(localPath, { force: true });
                }
                catch { }
            }
            else if (r.artifactUrl?.startsWith('/')) {
                try {
                    await fs.rm(r.artifactUrl, { force: true });
                }
                catch { }
            }
        }
        try {
            if (await this.storage.isEnabled()) {
                const bucket = await this.storage.ensureBucket();
                for (const r of rows) {
                    if (r.s3KeyPrefix) {
                        try {
                            await this.storage.removeObject(bucket, r.s3KeyPrefix);
                        }
                        catch { }
                    }
                }
            }
        }
        catch (e) {
            this.logger.warn(`S3 retention failed: ${e instanceof Error ? e.message : e}`);
        }
        this.logger.log(`Retention job completed for ${rows.length} builds`);
    }
};
__decorate([
    Cron(CronExpression.EVERY_DAY_AT_3AM),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RetentionScheduler.prototype, "cleanupArtifacts", null);
RetentionScheduler = RetentionScheduler_1 = __decorate([
    Injectable(),
    __param(0, Inject(PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, S3StorageService])
], RetentionScheduler);
export { RetentionScheduler };
//# sourceMappingURL=retention.scheduler.js.map