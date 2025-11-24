import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { CoolifyProvider } from './coolify.provider';
export declare class DeploymentsService {
    private readonly db;
    private readonly coolify;
    private readonly logger;
    constructor(db: NodePgDatabase<typeof schema>, coolify: CoolifyProvider);
    deploy(params: {
        tenantId: string;
        siteId: string;
        buildId: string;
        artifactUrl: string;
    }): Promise<{
        deploymentId: any;
        url: string;
    }>;
}
