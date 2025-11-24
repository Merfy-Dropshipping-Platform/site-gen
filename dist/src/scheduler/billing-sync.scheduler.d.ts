import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { ClientProxy } from '@nestjs/microservices';
import { SitesDomainService } from '../sites.service';
export declare class BillingSyncScheduler {
    private readonly db;
    private readonly billingClient;
    private readonly userClient;
    private readonly sites;
    private readonly logger;
    constructor(db: NodePgDatabase<typeof schema>, billingClient: ClientProxy, userClient: ClientProxy, sites: SitesDomainService);
    private rpc;
    reconcileBilling(): Promise<void>;
}
