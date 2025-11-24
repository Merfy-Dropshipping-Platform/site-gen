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
var BillingListenerController_1;
var _a, _b;
import { Controller, Inject, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { USER_RMQ_SERVICE } from '../constants';
import { SitesDomainService } from '../sites.service';
let BillingListenerController = BillingListenerController_1 = class BillingListenerController {
    constructor(userClient, sites) {
        this.userClient = userClient;
        this.sites = sites;
        this.logger = new Logger(BillingListenerController_1.name);
    }
    async handleSubscriptionUpdated(payload, _ctx) {
        try {
            if (!payload?.accountId) {
                this.logger.warn('billing.subscription.updated without accountId');
                return;
            }
            const res = await new Promise((resolve, reject) => {
                const sub = this.userClient.send('user.get_active_organization', { accountId: payload.accountId }).subscribe({
                    next: (v) => resolve(v),
                    error: reject,
                    complete: () => sub.unsubscribe(),
                });
            });
            const tenantId = res?.organizationId ?? undefined;
            if (!tenantId) {
                this.logger.warn(`No organization for accountId=${payload.accountId}`);
                return;
            }
            const status = String(payload?.status ?? '').toLowerCase();
            const shouldFreeze = status === 'past_due' || status === 'frozen' || status === 'canceled';
            if (shouldFreeze) {
                const result = await this.sites.freezeTenant(tenantId);
                this.logger.log(`Tenant ${tenantId} frozen by billing update (status=${status}), affected=${result.affected}`);
            }
            else {
                const result = await this.sites.unfreezeTenant(tenantId);
                this.logger.log(`Tenant ${tenantId} unfrozen by billing update (status=${status}), affected=${result.affected}`);
            }
        }
        catch (e) {
            this.logger.warn(`Failed to process billing.subscription.updated: ${e instanceof Error ? e.message : e}`);
        }
    }
};
__decorate([
    EventPattern('billing.subscription.updated'),
    __param(0, Payload()),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_b = typeof RmqContext !== "undefined" && RmqContext) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], BillingListenerController.prototype, "handleSubscriptionUpdated", null);
BillingListenerController = BillingListenerController_1 = __decorate([
    Controller(),
    __param(0, Inject(USER_RMQ_SERVICE)),
    __metadata("design:paramtypes", [typeof (_a = typeof ClientProxy !== "undefined" && ClientProxy) === "function" ? _a : Object, SitesDomainService])
], BillingListenerController);
export { BillingListenerController };
//# sourceMappingURL=billing.listener.js.map