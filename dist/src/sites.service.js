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
var SitesDomainService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { PG_CONNECTION } from './constants';
import * as schema from './db/schema';
import { SiteGeneratorService } from './generator/generator.service';
import { SitesEventsService } from './events/events.service';
import { DeploymentsService } from './deployments/deployments.service';
import { CoolifyProvider } from './deployments/coolify.provider';
import { S3StorageService } from './storage/s3.service';
function slugify(input) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}
let SitesDomainService = SitesDomainService_1 = class SitesDomainService {
    constructor(db, generator, events, deployments, coolify, storage) {
        this.db = db;
        this.generator = generator;
        this.events = events;
        this.deployments = deployments;
        this.coolify = coolify;
        this.storage = storage;
        this.logger = new Logger(SitesDomainService_1.name);
    }
    async list(tenantId, limit = 50, cursor) {
        const rows = await this.db
            .select({
            id: schema.site.id,
            name: schema.site.name,
            slug: schema.site.slug,
            status: schema.site.status,
            createdAt: schema.site.createdAt,
        })
            .from(schema.site)
            .where(and(eq(schema.site.tenantId, tenantId), sql `${schema.site.deletedAt} IS NULL`))
            .limit(limit);
        return { items: rows, nextCursor: null };
    }
    async get(tenantId, siteId) {
        const [row] = await this.db
            .select()
            .from(schema.site)
            .where(and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)));
        return row ?? null;
    }
    async create(params) {
        const id = randomUUID();
        let effectiveSlug = params.slug?.trim();
        if (!effectiveSlug) {
            effectiveSlug = slugify(params.name);
        }
        let candidate = effectiveSlug;
        let n = 1;
        while (true) {
            const existing = await this.db
                .select({ id: schema.site.id })
                .from(schema.site)
                .where(and(eq(schema.site.tenantId, params.tenantId), ilike(schema.site.slug, candidate)))
                .limit(1);
            if (existing.length === 0)
                break;
            candidate = `${effectiveSlug}-${n++}`;
        }
        const now = new Date();
        await this.db.insert(schema.site).values({
            id,
            tenantId: params.tenantId,
            name: params.name,
            slug: candidate,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
            createdBy: params.actorUserId,
            updatedBy: params.actorUserId,
        });
        this.events.emit('sites.site.created', { tenantId: params.tenantId, siteId: id, name: params.name, slug: candidate });
        return id;
    }
    async update(params) {
        const updates = {};
        if (typeof params.patch?.name === 'string' && params.patch.name.trim()) {
            updates.name = params.patch.name.trim();
        }
        if (params.patch?.slug) {
            const effectiveSlug = String(params.patch.slug).trim();
            if (effectiveSlug) {
                let candidate = effectiveSlug;
                let n = 1;
                while (true) {
                    const existing = await this.db
                        .select({ id: schema.site.id })
                        .from(schema.site)
                        .where(and(eq(schema.site.tenantId, params.tenantId), ilike(schema.site.slug, candidate), sql `${schema.site.id} != ${params.siteId}`))
                        .limit(1);
                    if (existing.length === 0)
                        break;
                    candidate = `${effectiveSlug}-${n++}`;
                }
                updates.slug = candidate;
            }
        }
        if (params.patch?.theme) {
            const size = Buffer.byteLength(JSON.stringify(params.patch.theme), 'utf8');
            if (size > SitesDomainService_1.MAX_THEME_BYTES) {
                throw new Error('theme_payload_too_large');
            }
            updates.theme = params.patch.theme;
        }
        updates.updatedAt = new Date();
        if (params.actorUserId)
            updates.updatedBy = params.actorUserId;
        const [row] = await this.db
            .update(schema.site)
            .set(updates)
            .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)))
            .returning({ id: schema.site.id });
        if (row)
            this.events.emit('sites.site.updated', { tenantId: params.tenantId, siteId: params.siteId, patch: params.patch ?? {} });
        return Boolean(row);
    }
    async softDelete(tenantId, siteId) {
        const [row] = await this.db
            .update(schema.site)
            .set({ deletedAt: new Date() })
            .where(and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)))
            .returning({ id: schema.site.id });
        if (row) {
            this.events.emit('sites.site.deleted', { tenantId, siteId, soft: true });
            try {
                await this.coolify.toggleMaintenance(siteId, true);
            }
            catch { }
        }
        return Boolean(row);
    }
    async hardDelete(tenantId, siteId) {
        const [row] = await this.db
            .delete(schema.site)
            .where(and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)))
            .returning({ id: schema.site.id });
        if (row) {
            this.events.emit('sites.site.deleted', { tenantId, siteId, soft: false });
            try {
                const artifactsDir = path.join(process.cwd(), 'artifacts', siteId);
                await fsp.rm(artifactsDir, { recursive: true, force: true });
            }
            catch { }
            try {
                if (await this.storage.isEnabled()) {
                    const bucket = await this.storage.ensureBucket();
                    const prefix = `sites/${tenantId}/${siteId}/`;
                    await this.storage.removePrefix(bucket, prefix);
                }
            }
            catch { }
        }
        return Boolean(row);
    }
    async attachDomain(params) {
        const site = await this.get(params.tenantId, params.siteId);
        if (!site)
            throw new Error('site_not_found');
        const id = randomUUID();
        const token = crypto.randomUUID().replace(/-/g, '');
        try {
            await this.db.insert(schema.siteDomain).values({
                id,
                siteId: params.siteId,
                domain: params.domain,
                status: 'pending',
                verificationToken: token,
                verificationType: 'dns',
                createdAt: new Date(),
            });
        }
        catch (e) {
            const message = e?.message?.toLowerCase?.() ?? '';
            if (message.includes('duplicate') || message.includes('unique')) {
                throw new Error('domain_already_in_use');
            }
            throw e;
        }
        this.events.emit('sites.domain.attached', { tenantId: params.tenantId, siteId: params.siteId, domain: params.domain });
        const dnsName = `_merfy-verify.${params.domain}`;
        const dnsValue = token;
        return { id, challenge: { type: 'dns', name: dnsName, value: dnsValue } };
    }
    async verifyDomain(params) {
        const site = await this.get(params.tenantId, params.siteId);
        if (!site)
            throw new Error('site_not_found');
        if (!params.domain) {
            throw new Error('domain_required');
        }
        const [record] = await this.db
            .select({ id: schema.siteDomain.id, token: schema.siteDomain.verificationToken })
            .from(schema.siteDomain)
            .where(and(eq(schema.siteDomain.siteId, params.siteId), eq(schema.siteDomain.domain, params.domain)));
        if (!record)
            return false;
        if (record.token && params.token && record.token !== params.token) {
            throw new Error('verification_token_mismatch');
        }
        const [row] = await this.db
            .update(schema.siteDomain)
            .set({ status: 'verified', verifiedAt: new Date() })
            .where(and(eq(schema.siteDomain.siteId, params.siteId), eq(schema.siteDomain.domain, params.domain)))
            .returning({ id: schema.siteDomain.id, domain: schema.siteDomain.domain });
        if (row) {
            this.events.emit('sites.domain.verified', { tenantId: params.tenantId, siteId: params.siteId, domain: params.domain });
            await this.coolify.setDomain(params.siteId, params.domain);
        }
        return Boolean(row);
    }
    async publish(params) {
        const site = await this.get(params.tenantId, params.siteId);
        if (!site)
            throw new Error('site_not_found');
        const { buildId, artifactUrl, revisionId } = await this.generator.build({ tenantId: params.tenantId, siteId: params.siteId, mode: params.mode });
        const { url } = await this.deployments.deploy({ tenantId: params.tenantId, siteId: params.siteId, buildId, artifactUrl });
        await this.db
            .update(schema.site)
            .set({ status: 'published', currentRevisionId: revisionId, updatedAt: new Date() })
            .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)));
        this.events.emit('sites.site.published', { tenantId: params.tenantId, siteId: params.siteId, buildId, url });
        return { url, buildId, artifactUrl };
    }
    async listRevisions(tenantId, siteId, limit = 50) {
        const site = await this.get(tenantId, siteId);
        if (!site)
            throw new Error('site_not_found');
        const rows = await this.db
            .select({ id: schema.siteRevision.id, createdAt: schema.siteRevision.createdAt })
            .from(schema.siteRevision)
            .where(eq(schema.siteRevision.siteId, siteId))
            .limit(limit);
        return { items: rows };
    }
    async createRevision(params) {
        const site = await this.get(params.tenantId, params.siteId);
        if (!site)
            throw new Error('site_not_found');
        const id = crypto.randomUUID();
        await this.db.insert(schema.siteRevision).values({
            id,
            siteId: params.siteId,
            data: params.data ?? {},
            meta: params.meta ?? {},
            createdAt: new Date(),
            createdBy: params.actorUserId,
        });
        if (params.setCurrent) {
            await this.db
                .update(schema.site)
                .set({ currentRevisionId: id, updatedAt: new Date() })
                .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)));
        }
        return { revisionId: id };
    }
    async setCurrentRevision(params) {
        const site = await this.get(params.tenantId, params.siteId);
        if (!site)
            throw new Error('site_not_found');
        const [rev] = await this.db
            .select({ id: schema.siteRevision.id })
            .from(schema.siteRevision)
            .where(and(eq(schema.siteRevision.id, params.revisionId), eq(schema.siteRevision.siteId, params.siteId)));
        if (!rev)
            throw new Error('revision_not_found');
        await this.db
            .update(schema.site)
            .set({ currentRevisionId: params.revisionId, updatedAt: new Date() })
            .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)));
        return { success: true };
    }
    async freezeTenant(tenantId) {
        const res = await this.db
            .update(schema.site)
            .set({ prevStatus: sql `${schema.site.status}`, status: 'frozen', frozenAt: new Date() })
            .where(and(eq(schema.site.tenantId, tenantId), sql `${schema.site.deletedAt} IS NULL`, sql `${schema.site.status} != 'frozen'`))
            .returning({ id: schema.site.id });
        this.events.emit('sites.tenant.frozen', { tenantId, count: res.length });
        for (const row of res) {
            try {
                await this.coolify.toggleMaintenance(row.id, true);
            }
            catch { }
        }
        return { affected: res.length };
    }
    async unfreezeTenant(tenantId) {
        const res = await this.db
            .update(schema.site)
            .set({ status: sql `COALESCE(${schema.site.prevStatus}, 'draft')`, prevStatus: null, frozenAt: null })
            .where(and(eq(schema.site.tenantId, tenantId), eq(schema.site.status, 'frozen')))
            .returning({ id: schema.site.id });
        this.events.emit('sites.tenant.unfrozen', { tenantId, count: res.length });
        for (const row of res) {
            try {
                await this.coolify.toggleMaintenance(row.id, false);
            }
            catch { }
        }
        return { affected: res.length };
    }
};
SitesDomainService.MAX_THEME_BYTES = 512 * 1024;
SitesDomainService = SitesDomainService_1 = __decorate([
    Injectable(),
    __param(0, Inject(PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, SiteGeneratorService,
        SitesEventsService,
        DeploymentsService,
        CoolifyProvider,
        S3StorageService])
], SitesDomainService);
export { SitesDomainService };
//# sourceMappingURL=sites.service.js.map