var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health.controller';
import { SitesMicroserviceController } from './sites.microservice.controller';
import { GeneratorMicroserviceController } from './generator/generator.controller';
import { SiteGeneratorService } from './generator/generator.service';
import { SitesDomainService } from './sites.service';
import { EventsModule } from './events/events.module';
import { BillingListenerController } from './billing/billing.listener';
import { CoolifyProvider } from './deployments/coolify.provider';
import { DeploymentsService } from './deployments/deployments.service';
import { S3StorageService } from './storage/s3.service';
import { ScheduleModule } from '@nestjs/schedule';
import { RetentionScheduler } from './scheduler/retention.scheduler';
import { BillingSyncScheduler } from './scheduler/billing-sync.scheduler';
let AppModule = class AppModule {
};
AppModule = __decorate([
    Module({
        imports: [
            ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: process.env.NODE_ENV === 'production' ? undefined : ['.env.local', '.env'],
            }),
            CqrsModule.forRoot(),
            ScheduleModule.forRoot(),
            RabbitMQModule,
            EventsModule,
            DatabaseModule,
        ],
        controllers: [HealthController, SitesMicroserviceController, GeneratorMicroserviceController, BillingListenerController],
        providers: [SitesDomainService, SiteGeneratorService, CoolifyProvider, DeploymentsService, S3StorageService, RetentionScheduler, BillingSyncScheduler],
    })
], AppModule);
export { AppModule };
//# sourceMappingURL=app.module.js.map