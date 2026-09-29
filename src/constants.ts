export const RMQ_SERVICE = "RMQ_SERVICE";
export const BILLING_RMQ_SERVICE = "BILLING_RMQ_SERVICE";
export const PRODUCT_RMQ_SERVICE = "PRODUCT_RMQ_SERVICE";
export const DOMAIN_RMQ_SERVICE = "DOMAIN_RMQ_SERVICE";
export const COOLIFY_RMQ_SERVICE = "COOLIFY_RMQ_SERVICE";
export const PG_CONNECTION = "PG_CONNECTION";
export const USER_RMQ_SERVICE = "USER_RMQ_SERVICE";

/**
 * Очередь, которую слушает sites (RPC и свои события). Отдельный стенд
 * поднимает копию сервиса на том же брокере — ему задают своё имя через
 * `SITES_QUEUE`, иначе копии делили бы одну очередь.
 */
export function sitesQueue(): string {
  return process.env.SITES_QUEUE || "sites_queue";
}

/**
 * Остальные общие точки брокера, через которые копия сервиса на том же
 * брокере задевала бы основную. Без env — прежние имена и поведение.
 *
 * - `SITES_BILLING_EVENTS_QUEUE` — своя очередь на fanout `billing.events`:
 *   с общим именем копия стала бы вторым потребителем и отбирала события.
 * - `SITES_BUILD_QUEUE` — очередь сборок: иначе сборку, поставленную копией,
 *   забрал бы потребитель основного сервиса и собрал из своей базы.
 * - `SITES_USER_EVENTS_ENABLED=false` — не слать `sites.site.*` в user_queue:
 *   user-сервис основной среды правил бы по ним команды магазинов.
 */
export function sitesBillingEventsQueue(): string {
  return process.env.SITES_BILLING_EVENTS_QUEUE || "sites_billing_events";
}

export function sitesBuildQueue(): string {
  return process.env.SITES_BUILD_QUEUE || "sites_build_queue";
}

export function userEventsEnabled(): boolean {
  return (process.env.SITES_USER_EVENTS_ENABLED ?? "true").toLowerCase() !== "false";
}

/**
 * Sentinel-значение `site.coolifyAppUuid` для сайтов, обслуживаемых ОБЩИМ
 * центральным прокси (Phase 3 миграции), а НЕ собственным per-site Coolify-app.
 * Инвариант: `coolifyAppUuid === CENTRAL_PROXY_APP_SENTINEL` ⇒ контейнера нет,
 * вместо него Traefik dynamic-роутер (`site-<slug>.yml`). Любой код, который
 * шлёт `appUuid` в Coolify, должен исключать это значение.
 */
export const CENTRAL_PROXY_APP_SENTINEL = "central-proxy";

/**
 * Предел ожидания ответа Coolify worker на RPC (`SitesDomainService.callCoolify`).
 * Этап 3: из него же считается бюджет прохода саги рождения (аренда строки
 * обязана покрывать проект и маршрут хостинга, см. store-lifecycle.spec.ts).
 */
export const COOLIFY_RPC_TIMEOUT_MS = 30_000;
