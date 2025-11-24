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
var DeploymentsService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as schema from '../db/schema';
import { PG_CONNECTION } from '../constants';
import { CoolifyProvider } from './coolify.provider';
let DeploymentsService = DeploymentsService_1 = class DeploymentsService {
    constructor(db, coolify) {
        this.db = db;
        this.coolify = coolify;
        this.logger = new Logger(DeploymentsService_1.name);
    }
    async deploy(params) {
        const ensure = await this.coolify.ensureApp(params.siteId);
        const { url } = await this.coolify.deployBuild({
            siteId: params.siteId,
            buildId: params.buildId,
            artifactUrl: params.artifactUrl,
        });
        const id = randomUUID();
        const now = new Date();
        await this.db.insert(schema.siteDeployment).values({
            id,
            siteId: params.siteId,
            buildId: params.buildId,
            coolifyAppId: ensure.appId,
            coolifyEnvId: ensure.envId,
            status: 'deployed',
            url,
            createdAt: now,
            updatedAt: now,
        });
        return { deploymentId: id, url };
    }
};
DeploymentsService = DeploymentsService_1 = __decorate([
    Injectable(),
    __param(0, Inject(PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, CoolifyProvider])
], DeploymentsService);
export { DeploymentsService };
//# sourceMappingURL=deployments.service.js.map