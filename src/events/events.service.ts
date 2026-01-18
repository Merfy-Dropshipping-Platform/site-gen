/**
 * Обёртка над ClientProxy для публикации доменных событий.
 * Ошибки публикации глушатся намеренно, чтобы не ломать основной сценарий
 * (сервис остаётся устойчивым даже при проблемах с брокером).
 */
import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";

@Injectable()
export class SitesEventsService {
  constructor(
    @Inject("SITES_EVENTS_CLIENT") private readonly client: ClientProxy,
  ) {}

  emit(pattern: string, payload: any) {
    try {
      this.client.emit(pattern, payload).subscribe({ error: () => void 0 });
    } catch {
      // best-effort
    }
  }
}
