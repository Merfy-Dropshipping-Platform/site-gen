import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { S3StorageService } from '../storage/s3.service';
export declare class RetentionScheduler {
    private readonly db;
    private readonly storage;
    private readonly logger;
    constructor(db: NodePgDatabase<typeof schema>, storage: S3StorageService);
    cleanupArtifacts(): Promise<void>;
}
