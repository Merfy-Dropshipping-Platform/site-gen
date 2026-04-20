/**
 * Обёртка над ClientProxy для публикации доменных событий.
 * Ошибки публикации глушатся намеренно, чтобы не ломать основной сценарий
 * (сервис остаётся устойчивым даже при проблемах с брокером).
 *
 * Some patterns need to reach user-service (team-sync). For those we dual-emit:
 * once to sites_queue (for the internal drop-listener) and once to user_queue
 * (so user-service's @EventPattern handlers actually receive them).
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";

const USER_SERVICE_PATTERNS = new Set<string>([
  "sites.site.created",
  "sites.site.updated",
  "sites.site.deleted",
]);

@Injectable()
export class SitesEventsService {
  private readonly logger = new Logger(SitesEventsService.name);

  constructor(
    @Inject("SITES_EVENTS_CLIENT") private readonly sitesClient: ClientProxy,
    @Inject("USER_EVENTS_CLIENT") private readonly userClient: ClientProxy,
  ) {}

  emit(pattern: string, payload: any) {
    const payloadKeys =
      payload && typeof payload === "object"
        ? Object.keys(payload).join(",")
        : "(none)";

    // Always to sites_queue for local drop-listener (keeps RMQ happy).
    this.logger.log(
      `emit dispatching pattern=${pattern} client=sites payloadKeys=${payloadKeys}`,
    );
    try {
      this.sitesClient.emit(pattern, payload).subscribe({
        error: (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `emit failed pattern=${pattern} client=sites payloadKeys=${payloadKeys} err=${msg}`,
          );
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `emit threw sync pattern=${pattern} client=sites payloadKeys=${payloadKeys} err=${msg}`,
      );
    }

    // Additionally to user_queue for cross-service consumers.
    if (USER_SERVICE_PATTERNS.has(pattern)) {
      this.logger.log(
        `emit dispatching pattern=${pattern} client=user payloadKeys=${payloadKeys}`,
      );
      try {
        this.userClient.emit(pattern, payload).subscribe({
          error: (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(
              `emit failed pattern=${pattern} client=user payloadKeys=${payloadKeys} err=${msg}`,
            );
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `emit threw sync pattern=${pattern} client=user payloadKeys=${payloadKeys} err=${msg}`,
        );
      }
    }
  }
}
