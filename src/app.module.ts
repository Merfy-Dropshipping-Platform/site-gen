/**
 * Корневой модуль сервиса «Сайты».
 *
 * Состав модулей:
 * - ConfigModule: загрузка переменных окружения (глобально)
 * - CqrsModule: лёгкая CQRS‑обвязка (используется частично)
 * - RabbitMQModule: транспорт и клиенты RMQ (единая очередь `sites_queue`)
 * - EventsModule: best‑effort публикация доменных событий в RMQ
 * - DatabaseModule: провайдер подключения к PostgreSQL (Drizzle)
 *
 * Контроллеры:
 * - HealthController: HTTP‑хелсчек для оркестраторов (Coolify, Docker, K8s)
 * - SitesMicroserviceController: RPC‑входные точки (паттерны `sites.*`)
 * - GeneratorMicroserviceController: RPC‑сборка (паттерн `sites.build`)
 * - BillingListenerController: подписчик событий биллинга (пока логирующий)
 * - SitesEventsListenerController: no-op обработчики доменных событий (ack внутри очереди)
 *
 * Провайдеры:
 * - SitesDomainService: доменная логика (CRUD, домены, публикация, freeze/unfreeze)
 * - SiteGeneratorService: генерация артефактов и обновление статусов билдов
 * - CoolifyProvider + DeploymentsService: оркестрация деплоя (mock/http режимы)
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { LoggerModule } from "nestjs-pino";
import { RabbitMQModule } from "./rabbitmq/rabbitmq.module";
import { DatabaseModule } from "./db/database.module";
import { pinoConfig } from "./common/logger/pino.config";
import { MetricsModule } from "./common/metrics/metrics.module";
import { HealthController } from "./health.controller";
import { SitesMicroserviceController } from "./sites.microservice.controller";
import { GeneratorMicroserviceController } from "./generator/generator.controller";
import { SiteGeneratorService } from "./generator/generator.service";
import { SitesDomainService } from "./sites.service";
import { ThemesService } from "./themes.service";
import { ThemesMicroserviceController } from "./themes.microservice.controller";
import { EventsModule } from "./events/events.module";
import { BillingListenerController } from "./billing/billing.listener";
import { BillingClient } from "./billing/billing.client";
import { BillingEventsConsumer } from "./billing/billing-events.consumer";
import { UserListenerController } from "./user/user.listener";
import { CoolifyProvider } from "./deployments/coolify.provider";
import { DeploymentsService } from "./deployments/deployments.service";
import { S3StorageService } from "./storage/s3.service";
import { ScheduleModule } from "@nestjs/schedule";
import { RetentionScheduler } from "./scheduler/retention.scheduler";
import { BillingSyncScheduler } from "./scheduler/billing-sync.scheduler";
import { SiteProvisioningScheduler } from "./scheduler/site-provisioning.scheduler";
import { ContentSyncScheduler } from "./scheduler/content-sync.scheduler";
import { SitesEventsListenerController } from "./events/events.listener";
import { DomainModule } from "./domain";
import { BulkModule } from "./admin/bulk/bulk.module";
import { RetrySetupService } from "./rabbitmq/retry-setup.service";
import { BuildQueueConsumer } from "./rabbitmq/build-queue.consumer";

@Module({
  imports: [
    LoggerModule.forRoot(pinoConfig),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === "production"
          ? undefined
          : [".env.local", ".env"],
    }),
    MetricsModule,
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    RabbitMQModule,
    EventsModule,
    DatabaseModule,
    DomainModule,
    BulkModule,
  ],
  controllers: [
    HealthController,
    SitesMicroserviceController,
    ThemesMicroserviceController,
    GeneratorMicroserviceController,
    BillingListenerController,
    UserListenerController,
    SitesEventsListenerController,
  ],
  providers: [
    SitesDomainService,
    ThemesService,
    SiteGeneratorService,
    CoolifyProvider,
    DeploymentsService,
    S3StorageService,
    RetentionScheduler,
    BillingSyncScheduler,
    SiteProvisioningScheduler,
    ContentSyncScheduler,
    BillingClient,
    BillingEventsConsumer,
    RetrySetupService,
    BuildQueueConsumer,
  ],
})
export class AppModule {}
