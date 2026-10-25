import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * Тело JSON запросов к sites — до 512 КБ (блок 14 «Секций и SDK», Р14-12): файлы секции от шлюза — до 256 КБ текста,
 * в JSON с экранированием длиннее. По умолчанию express пускает 100 КБ. Шлюз сам режет тело больше 512 КБ (413).
 */
export const SITES_JSON_LIMIT = "512kb";

export function useSitesBodyParser(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: SITES_JSON_LIMIT });
}
