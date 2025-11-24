var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SitesEventsService } from './events.service';
let EventsModule = class EventsModule {
};
EventsModule = __decorate([
    Module({
        imports: [
            ClientsModule.registerAsync([
                {
                    name: 'SITES_EVENTS_CLIENT',
                    imports: [ConfigModule],
                    useFactory: (configService) => {
                        const rabbitmqUrl = configService.get('RABBITMQ_URL');
                        if (!rabbitmqUrl)
                            throw new Error('RABBITMQ_URL is not defined');
                        return {
                            transport: Transport.RMQ,
                            options: {
                                urls: [rabbitmqUrl],
                                queue: 'sites_queue',
                                queueOptions: { durable: true },
                            },
                        };
                    },
                    inject: [ConfigService],
                },
            ]),
        ],
        providers: [SitesEventsService],
        exports: [ClientsModule, SitesEventsService],
    })
], EventsModule);
export { EventsModule };
//# sourceMappingURL=events.module.js.map