/**
 * Обёртка над ClientProxy для публикации доменных событий.
 * Ошибки публикации глушатся намеренно, чтобы не ломать основной сценарий
 * (сервис остаётся устойчивым даже при проблемах с брокером).
 *
 * Some patterns need to reach user-service (team-sync). For those we dual-emit:
 * once to sites_queue (for the internal drop-listener) and once to user_queue
 * (so user-service's @EventPattern handlers actually receive them).
 */
import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";

const USER_SERVICE_PATTERNS = new Set<string>([
  "sites.site.created",
  "sites.site.updated",
  "sites.site.deleted",
]);

@Injectable()
export class SitesEventsService {
  constructor(
    @Inject("SITES_EVENTS_CLIENT") private readonly sitesClient: ClientProxy,
    @Inject("USER_EVENTS_CLIENT") private readonly userClient: ClientProxy,
  ) {}

  emit(pattern: string, payload: any) {
    // Always to sites_queue for local drop-listener (keeps RMQ happy).
    try {
      this.sitesClient.emit(pattern, payload).subscribe({ error: () => void 0 });
    } catch {
      // best-effort
    }

    // Additionally to user_queue for cross-service consumers.
    if (USER_SERVICE_PATTERNS.has(pattern)) {
      try {
        this.userClient.emit(pattern, payload).subscribe({ error: () => void 0 });
      } catch {
        // best-effort
      }
    }
  }
}
