/**
 * Статус сборки нового сборщика витрин (packages/storefront-builder) для
 * `GET /api/sites/:id/builds/:buildId/status` в том же виде полей, что у старых
 * сборок (`site_build`).
 *
 * Номер новой сборки — число (миллисекунды, `storefront_shop.build`), его
 * публикация магазина возвращает как `buildId`; у старых сборок — uuid.
 * Откуда состояние:
 * - сборка кончилась — строка `storefront_build` (сборщик пишет её при конце
 *   сборки, итог в `outcome`);
 * - сборка ещё не кончилась — строка магазина `storefront_shop`: `build` + `busy`
 *   (в очереди, пока `started_at` пуст, иначе идёт) или `next_build` (номер в
 *   резерве: магазин занят, правки войдут в следующую сборку);
 * - остальное (в том числе сборка, которую заменили новым номером после повтора
 *   или остановки сборщика) — «не найдено».
 *
 * `status` — значения старого `site_build_status` (queued|running|failed|
 * uploaded) плюс `paused`: сборка готова, но выкладка магазина стоит на паузе.
 * `uploaded` — сборка отработала и ничего делать не нужно (выложена, либо
 * выкладывать нечего); что именно случилось — в `message`.
 */

export type StorefrontBuildStatusValue =
  | "queued"
  | "running"
  | "failed"
  | "uploaded"
  | "paused";

export interface StorefrontBuildStatus {
  buildId: string;
  siteId: string;
  status: StorefrontBuildStatusValue;
  stage: string | null;
  percent: number;
  message: string | null;
  error: string | null;
  retryCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

/** Строка `storefront_build` — то, что нужно для ответа. */
export interface FinishedBuildRow {
  siteId: string;
  build: number;
  attempt: number;
  queuedAt: Date;
  startedAt: Date;
  finishedAt: Date;
  outcome: string;
  error: string | null;
}

/** Строка `storefront_shop` — то, что нужно для ответа. */
export interface ShopRow {
  siteId: string;
  state: string;
  build: number;
  nextBuild: number | null;
  attempt: number;
  queuedAt: Date | null;
  startedAt: Date | null;
  pendingEventAt: Date | null;
}

/** Номер новой сборки — целое десятичное число; всё остальное (uuid) — старая сборка. */
export function parseStorefrontBuildNumber(buildId: string): number | null {
  if (!/^\d{1,16}$/.test(buildId)) return null;
  const build = Number(buildId);
  return Number.isSafeInteger(build) ? build : null;
}

interface Outcome {
  status: StorefrontBuildStatusValue;
  message: string;
}

const OUTCOMES: Record<string, Outcome> = {
  live: {
    status: "uploaded",
    message: "Сборка выложена: магазин уже показывает эти правки.",
  },
  paused: {
    status: "paused",
    message:
      "Сборка готова, но выкладка магазина на паузе (так бывает при проверке обновления платформы). " +
      "Правки выйдут на сайт, когда пауза будет снята, а до тех пор домен показывает прошлую версию.",
  },
  stale: {
    status: "uploaded",
    message:
      "Сборка готова, но не выложена: на сайте уже более новая сборка, и эти правки в неё вошли.",
  },
  unchanged: {
    status: "uploaded",
    message:
      "Сайт не изменился: к моменту выкладки состояние магазина уже было другим (например, после отката), эта сборка не понадобилась.",
  },
  skipped: {
    status: "uploaded",
    message:
      "Собирать было нечего: сайт уже собран с этими правками, поэтому новая сборка не понадобилась.",
  },
  interrupted: {
    status: "failed",
    message:
      "Сборку прервал перезапуск сборщика витрин. Магазин поставлен на сборку заново, под другим номером.",
  },
};

function failedMessage(error: string | null): string {
  return error ? `Сборка не удалась: ${error}` : "Сборка не удалась.";
}

/** Ответ по строке `storefront_build`; null — итог, которого код не знает. */
export function finishedBuildStatus(
  row: FinishedBuildRow,
): StorefrontBuildStatus | null {
  const base = {
    buildId: String(row.build),
    siteId: row.siteId,
    stage: null,
    retryCount: row.attempt,
    startedAt: row.startedAt,
    completedAt: row.finishedAt,
    createdAt: row.queuedAt,
  };
  if (row.outcome === "failed") {
    return {
      ...base,
      status: "failed",
      percent: 0,
      message: failedMessage(row.error),
      error: row.error,
    };
  }
  const outcome = OUTCOMES[row.outcome];
  if (!outcome) return null;
  const interrupted = row.outcome === "interrupted";
  return {
    ...base,
    status: outcome.status,
    percent: interrupted ? 0 : 100,
    message: outcome.message,
    error: interrupted ? row.error : null,
  };
}

/** Указатель магазина (сборщик: GET /pointer) — то, что нужно для итога `paused`. */
export interface PointerFacts {
  build: number;
  paused: boolean;
  pending: number | null;
}

const PAUSED_UNKNOWN =
  " Текущее состояние выкладки проверить не удалось: возможно, пауза уже снята и сборка выложена.";

/**
 * Итог `paused` записан при конце сборки и потом не меняется, а паузу снимают —
 * тогда ждущая сборка становится живой. Поэтому статус сверяется с указателем
 * магазина: ждёт снятия паузы — `paused`; уже выложена — `uploaded`; на сайте
 * более новая — `uploaded`; указатель не прочитан (null) — `paused` с припиской.
 */
export function settlePausedStatus(
  status: StorefrontBuildStatus,
  pointer: PointerFacts | null,
): StorefrontBuildStatus {
  if (pointer === null) {
    return { ...status, message: `${status.message ?? ""}${PAUSED_UNKNOWN}` };
  }
  const build = Number(status.buildId);
  if (
    pointer.paused &&
    (pointer.pending === build || pointer.build === build)
  ) {
    return status;
  }
  if (pointer.build === build && !pointer.paused) {
    return { ...status, ...OUTCOMES.live };
  }
  return { ...status, ...OUTCOMES.stale };
}

/** Ответ по строке магазина, если сборка с этим номером ещё не кончилась; иначе null. */
export function pendingBuildStatus(
  shop: ShopRow,
  build: number,
  now: Date = new Date(),
): StorefrontBuildStatus | null {
  const base = {
    buildId: String(build),
    siteId: shop.siteId,
    stage: null,
    percent: 0,
    error: null,
    retryCount: shop.attempt,
    completedAt: null,
  };
  if (shop.state === "busy" && shop.build === build) {
    const createdAt = shop.queuedAt ?? now;
    if (shop.startedAt === null) {
      return {
        ...base,
        status: "queued",
        message: "Сборка в очереди, скоро начнётся.",
        startedAt: null,
        createdAt,
      };
    }
    const retry =
      shop.attempt > 0 ? ` Это повторная попытка (${shop.attempt + 1}-я).` : "";
    return {
      ...base,
      status: "running",
      message: `Сборка идёт, процент готовности заранее не известен.${retry}`,
      startedAt: shop.startedAt,
      createdAt,
    };
  }
  if (shop.nextBuild === build) {
    return {
      ...base,
      status: "queued",
      message:
        "Сборка ждёт своей очереди: сейчас идёт предыдущая сборка этого магазина, а ваши правки войдут в следующую.",
      startedAt: null,
      createdAt: shop.pendingEventAt ?? shop.queuedAt ?? now,
    };
  }
  return null;
}
