/**
 * EventsModule
 *
 * Предоставляет ClientProxy, связанный с той же очередью `sites_queue`,
 * для best‑effort публикации событий (fire‑and‑forget). Потребители могут
 * подписываться на них по мере необходимости.
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
    ]),
  ],
  providers: [SitesEventsService],
  exports: [ClientsModule, SitesEventsService],
})
export class EventsModule {}
