import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { S3StorageService } from '../storage/s3.service';
export declare class SiteGeneratorService {
    private readonly db;
    private readonly s3;
    private readonly logger;
    constructor(db: NodePgDatabase<typeof schema>, s3: S3StorageService);
    build(params: {
        tenantId: string;
        siteId: string;
        mode?: 'draft' | 'production';
    }): Promise<{
        buildId: any;
        revisionId: string;
        artifactUrl: string;
    }>;
    private cleanupOldArtifacts;
}
