import { Logger } from "@nestjs/common";
import type { Marker } from "@merfy-dropshipping-platform/images";
import {
  createLimiter,
  errorMessage,
  waitUpTo,
  QUEUE_FULL,
} from "./async-utils";
import type { Limiter } from "./async-utils";
import type { ImageStore } from "./image-store";
import type { ImagesLib } from "./images-lib";

/** Расширения картинок, для которых заводим копии или маркер. Видео и прочие файлы пропускаем. */
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "svg",
  "avif",
]);

export function isImageKey(key: string): boolean {
  const extension = key.split(".").pop() ?? "";
  return IMAGE_EXTENSIONS.has(extension.toLowerCase());
}

export interface VariantsOptions {
  /** Сколько запрос загрузки ждёт копии; дальше они доделываются в фоне. */
  budgetMs: number;
  /** Сколько копий делается одновременно (загрузки и пережатие вместе). */
  concurrency: number;
  /** Сколько задач ждёт очереди; дальше их подберёт фоновое пережатие. */
  maxQueue: number;
}

/**
 * Копии картинок при загрузке. Оригинал в хранилище не меняется:
 * рядом пишутся `.m.webp`, `.d.webp` и последним — маркер `.v.json`.
 */
export class ImageVariants {
  private readonly limiter: Limiter;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly store: ImageStore,
    private readonly lib: ImagesLib,
    private readonly options: VariantsOptions,
    private readonly logger: Logger = new Logger(ImageVariants.name),
  ) {
    this.limiter = createLimiter(options.concurrency, options.maxQueue);
  }

  /** Картинку сейчас обрабатывают — пережатию её брать не нужно. */
  isInFlight(key: string): boolean {
    return this.inFlight.has(key);
  }

  /**
   * После загрузки оригинала. Уложились в бюджет — копии и маркер уже записаны.
   * Нет — задача остаётся в очереди процесса и дописывает их сама. Никогда не бросает:
   * без копий витрина отдаёт оригинал, а необработанное подберёт пережатие.
   */
  async processUpload(key: string, bytes: Buffer): Promise<void> {
    if (!isImageKey(key) || this.isInFlight(key)) return;
    const job = this.generate(key, bytes).then(
      () => undefined,
      (error: unknown) => this.logFailure(key, error),
    );
    await waitUpTo(job, this.options.budgetMs);
  }

  /** Копии и маркер оригинала в хранилище. `null` — это сама копия или маркер, их не трогаем. */
  async generate(
    key: string,
    bytes: Uint8Array,
    previousAttempts = 0,
  ): Promise<Marker | null> {
    const { isDerivedKey } = await this.lib.names();
    if (isDerivedKey(key)) return null;
    this.inFlight.add(key);
    try {
      return await this.limiter.run(() =>
        this.generateAndWrite(key, bytes, previousAttempts),
      );
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Маркер `failed` с числом попыток: оригинал не удалось обработать, дальше
   * его не трогаем. Тело маркера и заголовки делает генератор — пустые байты
   * дают у него `failed` с `unreadable`.
   */
  async markFailed(key: string, attempts: number): Promise<void> {
    await this.generate(key, new Uint8Array(0), attempts - 1);
  }

  private async generateAndWrite(
    key: string,
    bytes: Uint8Array,
    previousAttempts: number,
  ): Promise<Marker> {
    const generator = await this.lib.generator();
    const { marker, files } = await generator.generateImage({
      key,
      bytes,
      previousAttempts,
    });
    // Копии, затем маркер: так велит пакет, и битой картинки не бывает.
    for (const file of files) {
      await this.store.put(file.key, file.body, {
        contentType: file.contentType,
        cacheControl: file.cacheControl,
      });
    }
    return marker;
  }

  private logFailure(key: string, error: unknown): void {
    const reason = errorMessage(error);
    const note =
      reason === QUEUE_FULL
        ? "очередь копий полна, подберёт пережатие"
        : reason;
    this.logger.warn(`Копии не сделаны (${key}): ${note}`);
  }
}
