/**
 * EventsModule
 *
 * Предоставляет два ClientProxy:
 *   - SITES_EVENTS_CLIENT → sites_queue (собственные события для drop-listener'а)
 *   - USER_EVENTS_CLIENT  → user_queue  (cross-service события team-sync
 *                           в user-service: sites.site.created/updated/deleted)
 *
 * Паттерн следует billing-service's BILLING_EVENTS_CLIENT → user_queue
 * (см. billing/src/rabbitmq/rabbitmq.module.ts).
 */
import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SitesEventsService } from "./events.service";

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: "SITES_EVENTS_CLIENT",
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const rabbitmqUrl = configService.get<string>("RABBITMQ_URL");
          if (!rabbitmqUrl) throw new Error("RABBITMQ_URL is not defined");
          return {
            transport: Transport.RMQ,
            options: {
              urls: [rabbitmqUrl],
              queue: "sites_queue",
              queueOptions: { durable: true },
            },
          };
        },
        inject: [ConfigService],
      },
      {
        name: "USER_EVENTS_CLIENT",
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const rabbitmqUrl = configService.get<string>("RABBITMQ_URL");
          if (!rabbitmqUrl) throw new Error("RABBITMQ_URL is not defined");
          return {
            transport: Transport.RMQ,
            options: {
              urls: [rabbitmqUrl],
              queue: "user_queue",
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
export class EventsModule {}
