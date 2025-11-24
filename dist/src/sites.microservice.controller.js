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
var SitesMicroserviceController_1;
var _a;
import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { SitesDomainService } from './sites.service';
let SitesMicroserviceController = SitesMicroserviceController_1 = class SitesMicroserviceController {
    constructor(service) {
        this.service = service;
        this.logger = new Logger(SitesMicroserviceController_1.name);
    }
    async createSite(data, _ctx) {
        try {
            this.logger.log(`create_site request: ${JSON.stringify(data)}`);
            const { tenantId, actorUserId, name, slug } = data ?? {};
            if (!tenantId || !actorUserId || !name) {
                return { success: false, message: 'tenantId, actorUserId and name are required' };
            }
            const siteId = await this.service.create({ tenantId, actorUserId, name, slug });
            return { success: true, siteId };
        }
        catch (e) {
            this.logger.error('create_site failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async getSite(data) {
        try {
            this.logger.log(`get_site request: ${JSON.stringify(data)}`);
            const { tenantId, siteId } = data ?? {};
            if (!tenantId || !siteId)
                return { success: false, message: 'tenantId and siteId are required' };
            const site = await this.service.get(tenantId, siteId);
            return { success: true, site };
        }
        catch (e) {
            this.logger.error('get_site failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async listSites(data) {
        try {
            this.logger.log(`list request: ${JSON.stringify(data)}`);
            const { tenantId, cursor, limit } = data ?? {};
            if (!tenantId)
                return { success: false, message: 'tenantId required' };
            const result = await this.service.list(tenantId, limit, cursor);
            return { success: true, ...result };
        }
        catch (e) {
            this.logger.error('list failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async updateSite(data) {
        try {
            const { tenantId, siteId, patch, actorUserId } = data ?? {};
            if (!tenantId || !siteId)
                return { success: false, message: 'tenantId and siteId required' };
            const ok = await this.service.update({ tenantId, siteId, patch: patch ?? {}, actorUserId });
            return { success: ok };
        }
        catch (e) {
            this.logger.error('update_site failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async deleteSite(data) {
        try {
            const { tenantId, siteId, hard } = data ?? {};
            if (!tenantId || !siteId)
                return { success: false, message: 'tenantId and siteId required' };
            const ok = hard ? await this.service.hardDelete(tenantId, siteId) : await this.service.softDelete(tenantId, siteId);
            return { success: ok };
        }
        catch (e) {
            this.logger.error('delete_site failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async attachDomain(data) {
        try {
            const { tenantId, siteId, domain, actorUserId } = data ?? {};
            if (!tenantId || !siteId || !domain || !actorUserId)
                return { success: false, message: 'tenantId, siteId, domain, actorUserId required' };
            const res = await this.service.attachDomain({ tenantId, siteId, domain, actorUserId });
            return { success: true, ...res };
        }
        catch (e) {
            this.logger.error('attach_domain failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async verifyDomain(data) {
        try {
            const { tenantId, siteId, domain } = data ?? {};
            if (!tenantId || !siteId)
                return { success: false, message: 'tenantId and siteId required' };
            const ok = await this.service.verifyDomain({ tenantId, siteId, domain });
            return { success: ok };
        }
        catch (e) {
            this.logger.error('verify_domain failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async publish(data) {
        try {
            const { tenantId, siteId, mode } = data ?? {};
            if (!tenantId || !siteId)
                return { success: false, message: 'tenantId and siteId required' };
            const res = await this.service.publish({ tenantId, siteId, mode });
            return { success: true, ...res };
        }
        catch (e) {
            this.logger.error('publish failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async freeze(data) {
        try {
            const { tenantId } = data ?? {};
            if (!tenantId)
                return { success: false, message: 'tenantId required' };
            const res = await this.service.freezeTenant(tenantId);
            return { success: true, ...res };
        }
        catch (e) {
            this.logger.error('freeze_tenant failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async unfreeze(data) {
        try {
            const { tenantId } = data ?? {};
            if (!tenantId)
                return { success: false, message: 'tenantId required' };
            const res = await this.service.unfreezeTenant(tenantId);
            return { success: true, ...res };
        }
        catch (e) {
            this.logger.error('unfreeze_tenant failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async listRevisions(data) {
        try {
            const { tenantId, siteId, limit } = data ?? {};
            if (!tenantId || !siteId)
                return { success: false, message: 'tenantId and siteId required' };
            const res = await this.service.listRevisions(tenantId, siteId, limit ?? 50);
            return { success: true, ...res };
        }
        catch (e) {
            this.logger.error('revisions.list failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async createRevision(data) {
        try {
            const { tenantId, siteId, data: revData, meta, actorUserId, setCurrent } = data ?? {};
            if (!tenantId || !siteId)
                return { success: false, message: 'tenantId and siteId required' };
            const res = await this.service.createRevision({ tenantId, siteId, data: revData, meta, actorUserId, setCurrent });
            return { success: true, ...res };
        }
        catch (e) {
            this.logger.error('revisions.create failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
    async setCurrentRevision(data) {
        try {
            const { tenantId, siteId, revisionId } = data ?? {};
            if (!tenantId || !siteId || !revisionId)
                return { success: false, message: 'tenantId, siteId and revisionId required' };
            const res = await this.service.setCurrentRevision({ tenantId, siteId, revisionId });
            return { success: true, ...res };
        }
        catch (e) {
            this.logger.error('revisions.set_current failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
};
__decorate([
    MessagePattern('sites.create_site'),
    __param(0, Payload()),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, typeof (_a = typeof RmqContext !== "undefined" && RmqContext) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "createSite", null);
__decorate([
    MessagePattern('sites.get_site'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "getSite", null);
__decorate([
    MessagePattern('sites.list'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "listSites", null);
__decorate([
    MessagePattern('sites.update_site'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "updateSite", null);
__decorate([
    MessagePattern('sites.delete_site'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "deleteSite", null);
__decorate([
    MessagePattern('sites.attach_domain'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "attachDomain", null);
__decorate([
    MessagePattern('sites.verify_domain'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "verifyDomain", null);
__decorate([
    MessagePattern('sites.publish'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "publish", null);
__decorate([
    MessagePattern('sites.freeze_tenant'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "freeze", null);
__decorate([
    MessagePattern('sites.unfreeze_tenant'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "unfreeze", null);
__decorate([
    MessagePattern('sites.revisions.list'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "listRevisions", null);
__decorate([
    MessagePattern('sites.revisions.create'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "createRevision", null);
__decorate([
    MessagePattern('sites.revisions.set_current'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SitesMicroserviceController.prototype, "setCurrentRevision", null);
SitesMicroserviceController = SitesMicroserviceController_1 = __decorate([
    Controller(),
    __metadata("design:paramtypes", [SitesDomainService])
], SitesMicroserviceController);
export { SitesMicroserviceController };
//# sourceMappingURL=sites.microservice.controller.js.map