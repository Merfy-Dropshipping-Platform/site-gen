/**
 * Фоновая работа команд этапа 3: запустить без ожидания, дождаться с
 * пределом, дождаться всего запущенного (тесты).
 *
 * Ошибка фона уходит в лог и наружу не летит: за фоновым проходом доводчика
 * стоит тик (строку подберут после аренды), за переизданием — статус в ответе.
 */
import { errorMessage } from "./error-message";

export class BackgroundWork {
  private readonly running = new Set<Promise<unknown>>();

  constructor(
    private readonly logger: { error(message: string): void },
    private readonly what: string,
  ) {}

  /** Запустить без ожидания; обещание результата (`undefined` при ошибке). */
  start<T>(work: Promise<T>): Promise<T | undefined> {
    const tracked = work.catch((e: unknown) => {
      this.logger.error(`${this.what}: ${errorMessage(e)}`);
      return undefined;
    });
    this.running.add(tracked);
    void tracked.finally(() => this.running.delete(tracked));
    return tracked;
  }

  /** Дождаться всего запущенного, включая начатое по ходу ожидания. */
  async settle(): Promise<void> {
    while (this.running.size) await Promise.allSettled([...this.running]);
  }
}

/** Пауза, которая не держит процесс при остановке. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}

/** Результат работы — или `onTimeout`, если она не успела за `ms`. */
export function within<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: T,
): Promise<T> {
  return Promise.race([work, delay(ms).then(() => onTimeout)]);
}
