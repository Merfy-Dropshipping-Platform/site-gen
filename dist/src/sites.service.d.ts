import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './db/schema';
import { SiteGeneratorService } from './generator/generator.service';
import { SitesEventsService } from './events/events.service';
import { DeploymentsService } from './deployments/deployments.service';
import { CoolifyProvider } from './deployments/coolify.provider';
import { S3StorageService } from './storage/s3.service';
export declare class SitesDomainService {
    private readonly db;
    private readonly generator;
    private readonly events;
    private readonly deployments;
    private readonly coolify;
    private readonly storage;
    private readonly logger;
    private static readonly MAX_THEME_BYTES;
    constructor(db: NodePgDatabase<typeof schema>, generator: SiteGeneratorService, events: SitesEventsService, deployments: DeploymentsService, coolify: CoolifyProvider, storage: S3StorageService);
    list(tenantId: string, limit?: number, cursor?: string): Promise<{
        items: any;
        nextCursor: null;
    }>;
    get(tenantId: string, siteId: string): Promise<any>;
    create(params: {
        tenantId: string;
        actorUserId: string;
        name: string;
        slug?: string;
    }): Promise<any>;
    update(params: {
        tenantId: string;
        siteId: string;
        patch: any;
        actorUserId?: string;
    }): Promise<boolean>;
    softDelete(tenantId: string, siteId: string): Promise<boolean>;
    hardDelete(tenantId: string, siteId: string): Promise<boolean>;
    attachDomain(params: {
        tenantId: string;
        siteId: string;
        domain: string;
        actorUserId: string;
    }): Promise<{
        id: any;
        challenge: {
            type: string;
            name: string;
            value: string;
        };
    }>;
    verifyDomain(params: {
        tenantId: string;
        siteId: string;
        domain?: string;
        token?: string;
    }): Promise<boolean>;
    publish(params: {
        tenantId: string;
        siteId: string;
        mode?: 'draft' | 'production';
    }): Promise<{
        url: string;
        buildId: any;
        artifactUrl: string;
    }>;
    listRevisions(tenantId: string, siteId: string, limit?: number): Promise<{
        items: any;
    }>;
    createRevision(params: {
        tenantId: string;
        siteId: string;
        data: any;
        meta?: any;
        actorUserId?: string;
        setCurrent?: boolean;
    }): Promise<{
        revisionId: `${string}-${string}-${string}-${string}-${string}`;
    }>;
    setCurrentRevision(params: {
        tenantId: string;
        siteId: string;
        revisionId: string;
    }): Promise<{
        readonly success: true;
    }>;
    freezeTenant(tenantId: string): Promise<{
        affected: any;
    }>;
    unfreezeTenant(tenantId: string): Promise<{
        affected: any;
    }>;
}
