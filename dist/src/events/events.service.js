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
var _a;
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
let SitesEventsService = class SitesEventsService {
    constructor(client) {
        this.client = client;
    }
    emit(pattern, payload) {
        try {
            this.client.emit(pattern, payload).subscribe({ error: () => void 0 });
        }
        catch {
        }
    }
};
SitesEventsService = __decorate([
    Injectable(),
    __param(0, Inject('SITES_EVENTS_CLIENT')),
    __metadata("design:paramtypes", [typeof (_a = typeof ClientProxy !== "undefined" && ClientProxy) === "function" ? _a : Object])
], SitesEventsService);
export { SitesEventsService };
//# sourceMappingURL=events.service.js.map