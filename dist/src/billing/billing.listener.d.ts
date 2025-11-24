import { RmqContext } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { SitesDomainService } from '../sites.service';
export declare class BillingListenerController {
    private readonly userClient;
    private readonly sites;
    private readonly logger;
    constructor(userClient: ClientProxy, sites: SitesDomainService);
    handleSubscriptionUpdated(payload: any, _ctx: RmqContext): Promise<void>;
}
