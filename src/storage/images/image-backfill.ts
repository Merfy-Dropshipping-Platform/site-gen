import { Logger } from "@nestjs/common";
import { cpus, loadavg } from "os";
import type { Marker } from "@merfy-dropshipping-platform/images";
import { errorMessage, sleep } from "./async-utils";
import type { ImageStore, StoredObject } from "./image-store";
import { isImageKey } from "./image-variants";
import type { ImageVariants } from "./image-variants";
import type { ImagesLib } from "./images-lib";

export interface BackfillOptions {
  /** Где искать оригиналы: `""` — весь бакет, `media/` — только медиа сайтов. */
  prefix: string;
  /** Пауза после каждой картинки. */
  pauseMs: number;
  /** Сколько раз пробуем одну картинку, прежде чем поставить `failed`. */
  maxAttempts: number;
  /** Нагрузка сервера (load average за минуту на ядро), выше которой пережатие стоит. */
  maxLoadPerCore: number;
  /** Как часто проверять, спала ли нагрузка. */
  overloadPauseMs: number;
}

export interface PassStats {
  listed: number;
  pending: number;
  done: number;
  failed: number;
  skipped: number;
}

type Outcome = "done" | "failed" | "skipped";

export interface BackfillDeps {
  isOverloaded: (maxLoadPerCore: number) => boolean;
  sleep: (ms: number) => Promise<void>;
}

/** Сервер общий с продом: load average за минуту, поделённый на число ядер. */
export const isHostOverloaded = (maxLoadPerCore: number): boolean =>
  loadavg()[0] / cpus().length > maxLoadPerCore;

const defaultDeps: BackfillDeps = { isOverloaded: isHostOverloaded, sleep };

/**
 * Оригиналы без маркера: картинки из списка, которые не копии и не маркеры
 * и у которых рядом нет `.v.json`. Один обход бакета, без запроса на каждый файл.
 */
export function findUnmarked(
  objects: StoredObject[],
  isDerivedKey: (key: string) => boolean,
  markerKey: (key: string) => string,
): string[] {
  const keys = new Set(objects.map((object) => object.key));
  return [...keys].filter(
    (key) => isImageKey(key) && !isDerivedKey(key) && !keys.has(markerKey(key)),
  );
}

/**
 * Пережатие старых картинок: копии и маркер тем, у кого маркера нет. По одной,
 * с паузой, и только пока сервер не загружен. Идемпотентно: после прохода у
 * каждой обработанной картинки есть маркер, и следующий проход её не берёт.
 */
export class ImageBackfill {
  constructor(
    private readonly store: ImageStore,
    private readonly variants: ImageVariants,
    private readonly lib: ImagesLib,
    private readonly options: BackfillOptions,
    private readonly deps: BackfillDeps = defaultDeps,
    private readonly logger: Logger = new Logger(ImageBackfill.name),
  ) {}

  async runPass(shouldStop: () => boolean = () => false): Promise<PassStats> {
    // Не загрузился пакет или sharp — это не вина картинок: проход не начинаем.
    const { isDerivedKey, markerKey } = await this.lib.names();
    await this.lib.generator();

    const objects = await this.store.list(this.options.prefix);
    const pending = findUnmarked(objects, isDerivedKey, markerKey);
    const stats: PassStats = {
      listed: objects.length,
      pending: pending.length,
      done: 0,
      failed: 0,
      skipped: 0,
    };
    for (const key of pending) {
      if (shouldStop()) break;
      await this.waitForCalmServer(shouldStop);
      const outcome = await this.processOne(key);
      stats[outcome] += 1;
      await this.deps.sleep(this.options.pauseMs);
    }
    return stats;
  }

  private async waitForCalmServer(shouldStop: () => boolean): Promise<void> {
    while (this.deps.isOverloaded(this.options.maxLoadPerCore)) {
      if (shouldStop()) return;
      await this.deps.sleep(this.options.overloadPauseMs);
    }
  }

  private async processOne(key: string): Promise<Outcome> {
    if (this.variants.isInFlight(key)) return "skipped";
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      const marker = await this.tryOnce(key, attempt);
      if (marker) return marker.status === "ok" ? "done" : "failed";
      await this.deps.sleep(this.options.pauseMs);
    }
    await this.giveUp(key);
    return "failed";
  }

  private async tryOnce(key: string, attempt: number): Promise<Marker | null> {
    try {
      const bytes = await this.store.get(key);
      return await this.variants.generate(key, bytes, attempt - 1);
    } catch (error) {
      const reason = errorMessage(error);
      this.logger.warn(`Пережатие ${key}, попытка ${attempt}: ${reason}`);
      return null;
    }
  }

  private async giveUp(key: string): Promise<void> {
    try {
      await this.variants.markFailed(key, this.options.maxAttempts);
    } catch (error) {
      const reason = errorMessage(error);
      this.logger.error(`Маркер failed не записан (${key}): ${reason}`);
    }
  }
}
