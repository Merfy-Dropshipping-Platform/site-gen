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
  /** Всего к обработке: без маркера и с маркером старой версии. */
  pending: number;
  /** Из `pending`: с маркером версии ниже текущей — им догенерируются недостающие копии. */
  outdated: number;
  done: number;
  failed: number;
  skipped: number;
}

/** Оригинал к обработке; `previous` — его маркер старой версии (копии оттуда не переписываем). */
export interface Candidate {
  key: string;
  previous?: Marker;
}

/** Сколько маркеров читаем за раз: они крошечные, но хранилище общее. */
const MARKER_READ_BATCH = 10;

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

/** Оригиналы, у которых маркер уже есть: их маркеры читаем, чтобы найти старую версию. */
export function findMarked(
  objects: StoredObject[],
  isDerivedKey: (key: string) => boolean,
  markerKey: (key: string) => string,
): string[] {
  const keys = new Set(objects.map((object) => object.key));
  return [...keys].filter(
    (key) => isImageKey(key) && !isDerivedKey(key) && keys.has(markerKey(key)),
  );
}

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

/**
 * Пережатие старых картинок: копии и маркер тем, у кого маркера нет, и недостающие
 * копии тем, чей маркер старой версии (готовые копии не переписываются). По одной,
 * с паузой, и только пока сервер не загружен. Идемпотентно: после прохода у
 * каждой обработанной картинки маркер текущей версии, и следующий проход её не берёт.
 */
export class ImageBackfill {
  /** Оригиналы, чей маркер уже текущей версии: повторно их маркеры не читаем. */
  private readonly current = new Set<string>();

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
    const unmarked = findUnmarked(objects, isDerivedKey, markerKey).map(
      (key): Candidate => ({ key }),
    );
    const marked = findMarked(objects, isDerivedKey, markerKey);
    const outdated = await this.findOutdated(marked, shouldStop);
    const pending = [...unmarked, ...outdated];
    const stats: PassStats = {
      listed: objects.length,
      pending: pending.length,
      outdated: outdated.length,
      done: 0,
      failed: 0,
      skipped: 0,
    };
    for (const candidate of pending) {
      if (shouldStop()) break;
      await this.waitForCalmServer(shouldStop);
      const outcome = await this.processOne(candidate);
      stats[outcome] += 1;
      await this.deps.sleep(this.options.pauseMs);
    }
    return stats;
  }

  /** Читает маркеры пачками, с оглядкой на нагрузку; версии не ниже текущей запоминает. */
  private async findOutdated(
    keys: string[],
    shouldStop: () => boolean,
  ): Promise<Candidate[]> {
    const { parseMarker, markerKey, needsUpgrade } = await this.lib.names();
    const found: Candidate[] = [];
    const unchecked = keys.filter((key) => !this.current.has(key));
    for (const batch of chunks(unchecked, MARKER_READ_BATCH)) {
      if (shouldStop()) break;
      await this.waitForCalmServer(shouldStop);
      const markers = await Promise.all(
        batch.map((key) => this.readMarker(markerKey(key), parseMarker)),
      );
      const sorted = batch.flatMap((key, index) =>
        this.sortOut(key, markers[index], needsUpgrade),
      );
      found.push(...sorted);
    }
    return found;
  }

  /** Старая версия — кандидат; текущая — запоминаем и больше не читаем; нет маркера — пропускаем. */
  private sortOut(
    key: string,
    previous: Marker | null,
    needsUpgrade: (marker: Marker) => boolean,
  ): Candidate[] {
    if (!previous) return [];
    if (needsUpgrade(previous)) return [{ key, previous }];
    this.current.add(key);
    return [];
  }

  /** Маркер не прочитался или битый — `null`: такой оригинал в этом проходе не трогаем. */
  private async readMarker(
    key: string,
    parse: (text: string) => Marker | null,
  ): Promise<Marker | null> {
    try {
      return parse((await this.store.get(key)).toString());
    } catch (error) {
      this.logger.warn(`Маркер ${key} не прочитан: ${errorMessage(error)}`);
      return null;
    }
  }

  private async waitForCalmServer(shouldStop: () => boolean): Promise<void> {
    while (this.deps.isOverloaded(this.options.maxLoadPerCore)) {
      if (shouldStop()) return;
      await this.deps.sleep(this.options.overloadPauseMs);
    }
  }

  private async processOne(candidate: Candidate): Promise<Outcome> {
    if (this.variants.isInFlight(candidate.key)) return "skipped";
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      const marker = await this.tryOnce(candidate, attempt);
      if (marker) return marker.status === "ok" ? "done" : "failed";
      await this.deps.sleep(this.options.pauseMs);
    }
    await this.giveUp(candidate);
    return "failed";
  }

  private async tryOnce(
    { key, previous }: Candidate,
    attempt: number,
  ): Promise<Marker | null> {
    try {
      const bytes = await this.store.get(key);
      return await this.variants.generate(key, bytes, attempt - 1, previous);
    } catch (error) {
      const reason = errorMessage(error);
      this.logger.warn(`Пережатие ${key}, попытка ${attempt}: ${reason}`);
      return null;
    }
  }

  private async giveUp({ key, previous }: Candidate): Promise<void> {
    try {
      await this.variants.markFailed(key, this.options.maxAttempts, previous);
    } catch (error) {
      const reason = errorMessage(error);
      this.logger.error(`Маркер failed не записан (${key}): ${reason}`);
    }
  }
}
