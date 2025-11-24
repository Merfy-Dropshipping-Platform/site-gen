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
var BillingSyncScheduler_1;
var _a, _b;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PG_CONNECTION, BILLING_RMQ_SERVICE, USER_RMQ_SERVICE } from '../constants';
import * as schema from '../db/schema';
import { sql } from 'drizzle-orm';
import { ClientProxy } from '@nestjs/microservices';
import { SitesDomainService } from '../sites.service';
let BillingSyncScheduler = BillingSyncScheduler_1 = class BillingSyncScheduler {
    constructor(db, billingClient, userClient, sites) {
        this.db = db;
        this.billingClient = billingClient;
        this.userClient = userClient;
        this.sites = sites;
        this.logger = new Logger(BillingSyncScheduler_1.name);
    }
    rpc(client, pattern, data) {
        return new Promise((resolve, reject) => {
            const sub = client.send(pattern, data).subscribe({
                next: (v) => resolve(v),
                error: (e) => reject(e),
                complete: () => sub.unsubscribe(),
            });
        });
    }
    async reconcileBilling() {
        if ((process.env.BILLING_SYNC_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
            return;
        }
        this.logger.log('Billing sync cron: start');
        try {
            const rows = await this.db
                .select({ tenantId: schema.site.tenantId })
                .from(schema.site)
                .where(sql `${schema.site.deletedAt} IS NULL`);
            const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter(Boolean)));
            for (const tenantId of tenantIds) {
                try {
                    const userRes = await this.rpc(this.userClient, 'user.get_tenant_billing_account', { tenantId });
                    const accountId = userRes?.accountId ?? undefined;
                    if (!accountId) {
                        this.logger.warn(`Billing cron: no billing account for tenant ${tenantId}`);
                        continue;
                    }
                    const entitlements = await this.rpc(this.billingClient, 'billing.get_entitlements', { accountId });
                    if (!entitlements?.success)
                        continue;
                    const frozen = Boolean(entitlements.frozen || entitlements.hasOpenInvoice);
                    if (frozen) {
                        const res = await this.sites.freezeTenant(tenantId);
                        this.logger.debug(`Billing cron: froze tenant ${tenantId} (affected=${res.affected})`);
                    }
                    else {
                        const res = await this.sites.unfreezeTenant(tenantId);
                        this.logger.debug(`Billing cron: unfroze tenant ${tenantId} (affected=${res.affected})`);
                    }
                }
                catch (e) {
                    this.logger.warn(`Billing cron: failed for tenant ${tenantId}: ${e instanceof Error ? e.message : e}`);
                }
            }
        }
        catch (e) {
            this.logger.warn(`Billing sync cron failed: ${e instanceof Error ? e.message : e}`);
        }
        finally {
            this.logger.log('Billing sync cron: done');
        }
    }
};
__decorate([
    Cron(CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BillingSyncScheduler.prototype, "reconcileBilling", null);
BillingSyncScheduler = BillingSyncScheduler_1 = __decorate([
    Injectable(),
    __param(0, Inject(PG_CONNECTION)),
    __param(1, Inject(BILLING_RMQ_SERVICE)),
    __param(2, Inject(USER_RMQ_SERVICE)),
    __metadata("design:paramtypes", [Object, typeof (_a = typeof ClientProxy !== "undefined" && ClientProxy) === "function" ? _a : Object, typeof (_b = typeof ClientProxy !== "undefined" && ClientProxy) === "function" ? _b : Object, SitesDomainService])
], BillingSyncScheduler);
export { BillingSyncScheduler };
//# sourceMappingURL=billing-sync.scheduler.js.map