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
var GeneratorMicroserviceController_1;
import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SiteGeneratorService } from './generator.service';
let GeneratorMicroserviceController = GeneratorMicroserviceController_1 = class GeneratorMicroserviceController {
    constructor(generator) {
        this.generator = generator;
        this.logger = new Logger(GeneratorMicroserviceController_1.name);
    }
    async handleBuild(data) {
        try {
            const { tenantId, siteId, mode } = data ?? {};
            if (!tenantId || !siteId)
                return { success: false, message: 'tenantId and siteId required' };
            const res = await this.generator.build({ tenantId, siteId, mode });
            return { success: true, ...res };
        }
        catch (e) {
            this.logger.error('build failed', e);
            return { success: false, message: e?.message ?? 'internal_error' };
        }
    }
};
__decorate([
    MessagePattern('sites.build'),
    __param(0, Payload()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GeneratorMicroserviceController.prototype, "handleBuild", null);
GeneratorMicroserviceController = GeneratorMicroserviceController_1 = __decorate([
    Controller(),
    __metadata("design:paramtypes", [SiteGeneratorService])
], GeneratorMicroserviceController);
export { GeneratorMicroserviceController };
//# sourceMappingURL=generator.controller.js.map