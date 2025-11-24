var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var CoolifyProvider_1;
import { Injectable, Logger } from '@nestjs/common';
let CoolifyProvider = CoolifyProvider_1 = class CoolifyProvider {
    constructor() {
        this.logger = new Logger(CoolifyProvider_1.name);
        this.mode = process.env.COOLIFY_MODE ?? 'mock';
        this.apiUrl = process.env.COOLIFY_API_URL;
        this.apiPrefix = process.env.COOLIFY_API_PREFIX || '/v1';
        this.EP_ENSURE = process.env.COOLIFY_ENDPOINT_ENSURE || `${this.apiPrefix}/apps/ensure`;
        this.EP_DEPLOY = process.env.COOLIFY_ENDPOINT_DEPLOY || `${this.apiPrefix}/apps/deploy`;
        this.EP_SET_DOMAIN = process.env.COOLIFY_ENDPOINT_SET_DOMAIN || `${this.apiPrefix}/apps/domains`;
        this.EP_MAINTENANCE = process.env.COOLIFY_ENDPOINT_MAINTENANCE || `${this.apiPrefix}/apps/maintenance`;
        this.apiToken = process.env.COOLIFY_API_TOKEN;
    }
    async http(path, init) {
        if (!this.apiUrl || !this.apiToken) {
            throw new Error('Coolify API not configured');
        }
        const url = `${this.apiUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
        const headers = {
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...init?.headers,
        };
        const res = await fetch(url, { ...init, headers });
        const hasPayload = res.status !== 204;
        const payload = hasPayload ? await res.json().catch(() => null) : null;
        if (!res.ok) {
            this.logger.warn(`Coolify API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
            throw new Error(`coolify_api_${res.status}`);
        }
        return payload;
    }
    async ensureApp(siteId) {
        if (this.mode !== 'http') {
            this.logger.log(`ensureApp (mock) for ${siteId}`);
            return { appId: `app_${siteId}`, envId: `env_${siteId}` };
        }
        try {
            const payload = await this.http(this.EP_ENSURE, {
                method: 'POST',
                body: JSON.stringify({ externalId: siteId }),
            });
            return {
                appId: String(payload?.appId ?? `app_${siteId}`),
                envId: String(payload?.envId ?? `env_${siteId}`),
            };
        }
        catch (e) {
            this.logger.warn(`ensureApp failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
            return { appId: `app_${siteId}`, envId: `env_${siteId}` };
        }
    }
    async deployBuild(params) {
        if (this.mode !== 'http') {
            this.logger.log(`deployBuild (mock) ${params.siteId} using ${params.artifactUrl}`);
            const url = `https://${params.siteId}.preview.local`;
            return { url };
        }
        try {
            const payload = await this.http(this.EP_DEPLOY, {
                method: 'POST',
                body: JSON.stringify({
                    externalId: params.siteId,
                    buildId: params.buildId,
                    artifactUrl: params.artifactUrl,
                }),
            });
            return { url: String(payload?.url ?? `https://${params.siteId}.preview.local`) };
        }
        catch (e) {
            this.logger.warn(`deployBuild failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
            return { url: `https://${params.siteId}.preview.local` };
        }
    }
    async setDomain(siteId, domain) {
        if (this.mode !== 'http') {
            this.logger.log(`setDomain (mock) for ${siteId} -> ${domain}`);
            return { success: true };
        }
        try {
            await this.http(this.EP_SET_DOMAIN, {
                method: 'POST',
                body: JSON.stringify({ externalId: siteId, domain, enableSsl: true }),
            });
            return { success: true };
        }
        catch (e) {
            this.logger.warn(`setDomain failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
            return { success: true };
        }
    }
    async toggleMaintenance(siteId, enabled) {
        if (this.mode !== 'http') {
            this.logger.log(`toggleMaintenance (mock) for ${siteId}: ${enabled}`);
            return { success: true };
        }
        try {
            await this.http(this.EP_MAINTENANCE, {
                method: 'POST',
                body: JSON.stringify({ externalId: siteId, enabled }),
            });
            return { success: true };
        }
        catch (e) {
            this.logger.warn(`toggleMaintenance failed, fallback to mock: ${e instanceof Error ? e.message : e}`);
            return { success: true };
        }
    }
};
CoolifyProvider = CoolifyProvider_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [])
], CoolifyProvider);
export { CoolifyProvider };
//# sourceMappingURL=coolify.provider.js.map