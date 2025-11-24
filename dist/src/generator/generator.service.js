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
var SiteGeneratorService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { PG_CONNECTION } from '../constants';
import * as schema from '../db/schema';
import { buildWithAstro } from './astro.builder';
import { S3StorageService } from '../storage/s3.service';
let SiteGeneratorService = SiteGeneratorService_1 = class SiteGeneratorService {
    constructor(db, s3) {
        this.db = db;
        this.s3 = s3;
        this.logger = new Logger(SiteGeneratorService_1.name);
    }
    async build(params) {
        let revisionId = null;
        const buildId = randomUUID();
        const now = new Date();
        const [siteRow] = await this.db
            .select({ id: schema.site.id, theme: schema.site.theme, currentRevisionId: schema.site.currentRevisionId })
            .from(schema.site)
            .where(eq(schema.site.id, params.siteId));
        if (siteRow?.currentRevisionId) {
            const [rev] = await this.db
                .select({ id: schema.siteRevision.id })
                .from(schema.siteRevision)
                .where(and(eq(schema.siteRevision.id, siteRow.currentRevisionId), eq(schema.siteRevision.siteId, params.siteId)));
            if (rev) {
                revisionId = rev.id;
            }
        }
        if (!revisionId) {
            const theme = siteRow?.theme ?? {};
            const data = Array.isArray(theme?.content) || typeof theme?.content === 'object' ? theme : { content: [], meta: { title: 'Мой сайт' } };
            revisionId = randomUUID();
            await this.db.insert(schema.siteRevision).values({
                id: revisionId,
                siteId: params.siteId,
                data,
                meta: { ...(data?.meta ?? {}), mode: params.mode ?? 'draft' },
                createdAt: now,
            });
        }
        await this.db.insert(schema.siteBuild).values({
            id: buildId,
            siteId: params.siteId,
            revisionId,
            status: 'queued',
            createdAt: now,
        });
        await this.db
            .update(schema.siteBuild)
            .set({ status: 'running' })
            .where(eq(schema.siteBuild.id, buildId));
        const workingDir = path.join(process.cwd(), '.astro-builds', params.siteId, buildId);
        const artifactsDir = path.join(process.cwd(), 'artifacts', params.siteId);
        await fs.mkdir(workingDir, { recursive: true });
        await fs.mkdir(artifactsDir, { recursive: true });
        let artifactFile = path.join(artifactsDir, `${buildId}.zip`);
        let artifactUrl = `file://${artifactFile}`;
        const astroEnabled = (process.env.ASTRO_BUILD_ENABLED ?? 'true').toLowerCase() !== 'false';
        try {
            if (astroEnabled) {
                const astroResult = await buildWithAstro({
                    workingDir,
                    outDir: artifactsDir,
                    outFileName: `${buildId}.zip`,
                    data: (await this.db
                        .select({ data: schema.siteRevision.data, meta: schema.siteRevision.meta })
                        .from(schema.siteRevision)
                        .where(eq(schema.siteRevision.id, revisionId))
                        .then((r) => ({ ...(r[0]?.data ?? {}), meta: r[0]?.meta ?? {} }))),
                });
                if (astroResult.ok && astroResult.artifactPath) {
                    artifactFile = astroResult.artifactPath;
                    artifactUrl = `file://${artifactFile}`;
                }
                else {
                    this.logger.warn(`Astro build failed, fallback to stub: ${astroResult.error ?? ''}`);
                    await fs.writeFile(artifactFile, JSON.stringify({ buildId, siteId: params.siteId, mode: params.mode ?? 'draft' }, null, 2));
                }
            }
            else {
                await fs.writeFile(artifactFile, JSON.stringify({ buildId, siteId: params.siteId, mode: params.mode ?? 'draft' }, null, 2));
            }
        }
        finally {
            try {
                await fs.rm(workingDir, { recursive: true, force: true });
            }
            catch {
            }
        }
        try {
            if (await this.s3.isEnabled()) {
                const bucket = await this.s3.ensureBucket();
                const key = `sites/${params.tenantId}/${params.siteId}/${buildId}.zip`;
                const uploadedUrl = await this.s3.uploadFile(bucket, key, artifactFile);
                artifactUrl = uploadedUrl ?? artifactUrl;
                await this.db
                    .update(schema.siteBuild)
                    .set({ s3Bucket: bucket, s3KeyPrefix: key })
                    .where(eq(schema.siteBuild.id, buildId));
            }
        }
        catch (e) {
            this.logger.warn(`S3 upload skipped/failed: ${e instanceof Error ? e.message : e}`);
        }
        await this.db
            .update(schema.siteBuild)
            .set({ status: 'uploaded', artifactUrl, completedAt: new Date() })
            .where(eq(schema.siteBuild.id, buildId));
        this.logger.log(`Generated build ${buildId} for site ${params.siteId} (artifact: ${artifactUrl})`);
        void this.cleanupOldArtifacts(artifactsDir).catch(() => undefined);
        return { buildId, revisionId: revisionId, artifactUrl };
    }
    async cleanupOldArtifacts(dir) {
        const days = Number.parseInt(String(process.env.ARTIFACT_RETENTION_DAYS ?? 14), 10);
        if (!Number.isFinite(days) || days <= 0)
            return;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            await Promise.all(entries
                .filter((e) => e.isFile() && e.name.endsWith('.zip'))
                .map(async (e) => {
                const p = path.join(dir, e.name);
                try {
                    const st = await fs.stat(p);
                    if (st.mtimeMs < cutoff) {
                        await fs.rm(p, { force: true });
                    }
                }
                catch { }
            }));
        }
        catch { }
    }
};
SiteGeneratorService = SiteGeneratorService_1 = __decorate([
    Injectable(),
    __param(0, Inject(PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, S3StorageService])
], SiteGeneratorService);
export { SiteGeneratorService };
//# sourceMappingURL=generator.service.js.map