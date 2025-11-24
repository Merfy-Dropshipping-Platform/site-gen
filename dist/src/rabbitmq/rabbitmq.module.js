var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BILLING_RMQ_SERVICE, RMQ_SERVICE, USER_RMQ_SERVICE } from '../constants';
let RabbitMQModule = class RabbitMQModule {
};
RabbitMQModule = __decorate([
    Module({
        imports: [
            ClientsModule.registerAsync([
                {
                    name: RMQ_SERVICE,
                    imports: [ConfigModule],
                    useFactory: (configService) => {
                        const rabbitmqUrl = configService.get('RABBITMQ_URL');
                        if (!rabbitmqUrl) {
                            throw new Error('RABBITMQ_URL is not defined');
                        }
                        return {
                            transport: Transport.RMQ,
                            options: {
                                urls: [rabbitmqUrl],
                                queue: 'sites_queue',
                                queueOptions: {
                                    durable: true,
                                },
                            },
                        };
                    },
                    inject: [ConfigService],
                },
                {
                    name: BILLING_RMQ_SERVICE,
                    imports: [ConfigModule],
                    useFactory: (configService) => {
                        const rabbitmqUrl = configService.get('RABBITMQ_URL');
                        if (!rabbitmqUrl) {
                            throw new Error('RABBITMQ_URL is not defined');
                        }
                        return {
                            transport: Transport.RMQ,
                            options: {
                                urls: [rabbitmqUrl],
                                queue: 'billing_queue',
                                queueOptions: {
                                    durable: true,
                                },
                            },
                        };
                    },
                    inject: [ConfigService],
                },
                {
                    name: USER_RMQ_SERVICE,
                    imports: [ConfigModule],
                    useFactory: (configService) => {
                        const rabbitmqUrl = configService.get('RABBITMQ_URL');
                        if (!rabbitmqUrl) {
                            throw new Error('RABBITMQ_URL is not defined');
                        }
                        return {
                            transport: Transport.RMQ,
                            options: {
                                urls: [rabbitmqUrl],
                                queue: 'user_queue',
                                queueOptions: {
                                    durable: true,
                                },
                            },
                        };
                    },
                    inject: [ConfigService],
                },
            ]),
        ],
        exports: [ClientsModule],
    })
], RabbitMQModule);
export { RabbitMQModule };
//# sourceMappingURL=rabbitmq.module.js.map