/**
 * Фоновый перевод секций «Публикации» в сохранённых ревизиях: категория → id
 * блога (правила — revision-blog-refs.ts).
 *
 * Раньше это делала миграция 0028 одним UPDATE рекурсивной plpgsql-функцией:
 * на dev 51 514 ревизий, ~88 мс на строку — минуты внутри старта контейнера,
 * Coolify не дожидался /health и откатывал выкатку. Теперь 0028 — пустая, а
 * перевод идёт после старта и не держит ни `listen`, ни /health.
 *
 * - Выборка — только строки с прежними категориями (регулярка на стороне
 *   Postgres): один проход собирает их id по возрастанию, затем пачки по 100
 *   читаются по id (с той же регуляркой — строка могла измениться). Запрос
 *   «id > последний LIMIT 100» с регуляркой планировщик выполняет полным
 *   просмотром таблицы на КАЖДУЮ пачку (замер: 20 проходов вместо одного).
 * - Запись — только если `data` не менялась с чтения (md5 текста jsonb): у
 *   site_revision нет updated_at, а конструктор может сохранить ревизию между
 *   чтением и записью — тогда строку пропускаем, следующий старт её подхватит.
 * - Один экземпляр за раз: `pg_try_advisory_lock` на отдельном соединении
 *   (тот же приём ключа, что в store-registry). Не взяли — перевод ведёт
 *   другой экземпляр, выходим.
 * - Идемпотентно: переведённая секция регулярке больше не отвечает, а
 *   повторный перевод ничего не меняет. Ошибка одной строки задачу не валит.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../constants";
import type * as schema from "../db/schema";
import {
  LEGACY_PUBLICATIONS_PATTERN,
  translatePublicationsBlogRefs,
  type BlogIdsByHandle,
} from "./revision-blog-refs";

export const REVISION_BLOG_REFS_BATCH = 100;
/** Пауза после старта: дать сервису подняться и ответить на /health. */
export const REVISION_BLOG_REFS_START_DELAY_MS = 5_000;
const LOCK_KEY = "sites:publications_revision_blog_refs";

/** То, что задаче нужно от соединения pg (типы `pg` в сервисе — `any`, src/types/pg.d.ts). */
export interface SqlClient {
  query<R = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}
interface DedicatedClient extends SqlClient {
  release(destroy?: boolean): void;
}
interface ClientPool {
  connect(): Promise<DedicatedClient>;
}

export interface RevisionRow {
  id: string;
  siteId: string;
  data: unknown;
  /** md5(data::text) на момент чтения — условие записи. */
  hash: string;
}

/** Доступ к базе для перевода; в тестах — память. */
export interface RevisionBlogRefsStore {
  tryLock(): Promise<boolean>;
  unlock(): Promise<void>;
  /** id всех строк с прежними категориями, по возрастанию. */
  legacyIds(): Promise<string[]>;
  /** Строки пачки, которые всё ещё с прежними категориями, по возрастанию id. */
  loadBatch(ids: readonly string[]): Promise<RevisionRow[]>;
  /** Блоги магазинов: site_id → (handle → id). */
  blogIds(siteIds: readonly string[]): Promise<Map<string, BlogIdsByHandle>>;
  /** Записать, только если data не менялась с чтения; false — запись не прошла. */
  writeIfUnchanged(id: string, hash: string, data: unknown): Promise<boolean>;
}

export interface RevisionBlogRefsSummary {
  /** false — блокировку держит другой экземпляр, перевод не запускался. */
  locked: boolean;
  batches: number;
  /** Строк выбрано регуляркой (и всё ещё подходящих при чтении пачки). */
  scanned: number;
  /** Строк записано. */
  updated: number;
  /** Секций переведено. */
  sections: number;
  /** Строк без секций для перевода (новый формат, нет блога у магазина). */
  unchanged: number;
  /** Строк, изменённых конструктором между чтением и записью. */
  conflicts: number;
  /** Строк с ошибкой. */
  failed: number;
}

type JobLogger = Pick<Logger, "log" | "warn">;

export async function runRevisionBlogRefs(
  store: RevisionBlogRefsStore,
  options: {
    logger: JobLogger;
    batchSize?: number;
    shouldStop?: () => boolean;
  },
): Promise<RevisionBlogRefsSummary> {
  const { logger } = options;
  const batchSize = options.batchSize ?? REVISION_BLOG_REFS_BATCH;
  const summary: RevisionBlogRefsSummary = {
    locked: false,
    batches: 0,
    scanned: 0,
    updated: 0,
    sections: 0,
    unchanged: 0,
    conflicts: 0,
    failed: 0,
  };

  if (!(await store.tryLock())) {
    logger.log(
      "Публикации в ревизиях: перевод уже идёт в другом экземпляре — пропуск",
    );
    return summary;
  }
  summary.locked = true;
  const started = Date.now();
  logger.log(
    `Публикации в ревизиях: старт перевода категорий в id блогов (пачка ${batchSize})`,
  );

  try {
    const ids = await store.legacyIds();
    logger.log(
      `Публикации в ревизиях: строк с прежними категориями ${ids.length}, пачек ${Math.ceil(ids.length / batchSize)}`,
    );
    for (let at = 0; at < ids.length; at += batchSize) {
      if (options.shouldStop?.()) break;
      const rows = await store.loadBatch(ids.slice(at, at + batchSize));
      summary.batches += 1;
      summary.scanned += rows.length;

      const blogs = await store.blogIds([
        ...new Set(rows.map((r) => r.siteId)),
      ]);
      let batchUpdated = 0;
      for (const row of rows) {
        try {
          const { data, sections } = translatePublicationsBlogRefs(
            row.data,
            blogs.get(row.siteId) ?? {},
          );
          if (sections === 0) {
            summary.unchanged += 1;
            continue;
          }
          if (await store.writeIfUnchanged(row.id, row.hash, data)) {
            summary.updated += 1;
            summary.sections += sections;
            batchUpdated += 1;
          } else {
            summary.conflicts += 1;
          }
        } catch (err) {
          summary.failed += 1;
          logger.warn(
            `Публикации в ревизиях: ревизия ${row.id} не переведена — ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      logger.log(
        `Публикации в ревизиях: пачка ${summary.batches} — строк ${rows.length}, записано ${batchUpdated}`,
      );
    }
  } finally {
    await store
      .unlock()
      .catch((err: unknown) =>
        logger.warn(
          `Публикации в ревизиях: не снята блокировка — ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  logger.log(
    `Публикации в ревизиях: конец${options.shouldStop?.() ? " (остановлен)" : ""} за ${Date.now() - started} мс — ` +
      `пачек ${summary.batches}, строк ${summary.scanned}, записано ${summary.updated} (секций ${summary.sections}), ` +
      `без изменений ${summary.unchanged}, конфликтов ${summary.conflicts}, ошибок ${summary.failed}`,
  );
  return summary;
}

/** Хранилище на одном соединении: advisory-блокировка сессии живёт на нём. */
export class PgRevisionBlogRefsStore implements RevisionBlogRefsStore {
  constructor(private readonly client: SqlClient) {}

  async tryLock(): Promise<boolean> {
    const { rows } = await this.client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked`,
      [LOCK_KEY],
    );
    return rows[0]?.locked === true;
  }

  async unlock(): Promise<void> {
    await this.client.query(
      `SELECT pg_advisory_unlock(hashtextextended($1, 0))`,
      [LOCK_KEY],
    );
  }

  async legacyIds(): Promise<string[]> {
    const { rows } = await this.client.query<{ id: string }>(
      `SELECT id
         FROM site_revision
        WHERE data IS NOT NULL
          AND data::text ~* $1
        ORDER BY id`,
      [LEGACY_PUBLICATIONS_PATTERN],
    );
    return rows.map((r) => r.id);
  }

  async loadBatch(ids: readonly string[]): Promise<RevisionRow[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.client.query<RevisionRow>(
      `SELECT id, site_id AS "siteId", data, md5(data::text) AS hash
         FROM site_revision
        WHERE id = ANY($1::text[])
          AND data IS NOT NULL
          AND data::text ~* $2
        ORDER BY id`,
      [ids, LEGACY_PUBLICATIONS_PATTERN],
    );
    return rows;
  }

  async blogIds(
    siteIds: readonly string[],
  ): Promise<Map<string, BlogIdsByHandle>> {
    const out = new Map<string, Record<string, string>>();
    if (siteIds.length === 0) return out;
    const { rows } = await this.client.query<{
      siteId: string;
      handle: string;
      id: string;
    }>(
      `SELECT site_id AS "siteId", handle, id FROM blogs WHERE site_id = ANY($1::text[])`,
      [siteIds],
    );
    for (const r of rows) {
      const byHandle = out.get(r.siteId) ?? {};
      byHandle[r.handle] = r.id;
      out.set(r.siteId, byHandle);
    }
    return out;
  }

  async writeIfUnchanged(
    id: string,
    hash: string,
    data: unknown,
  ): Promise<boolean> {
    const result = await this.client.query(
      `UPDATE site_revision SET data = $3::jsonb WHERE id = $1 AND md5(data::text) = $2`,
      [id, hash, JSON.stringify(data)],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

@Injectable()
export class PublicationsRevisionBlogRefsJob
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PublicationsRevisionBlogRefsJob.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running: Promise<RevisionBlogRefsSummary | null> | null = null;

  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** Не ждёт перевода: Nest вызывает хук до `listen`. */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    if (
      (
        process.env.PUBLICATIONS_REVISION_BLOG_REFS_ENABLED ?? "true"
      ).toLowerCase() === "false"
    ) {
      this.logger.log(
        "PUBLICATIONS_REVISION_BLOG_REFS_ENABLED=false — перевод ревизий выключен",
      );
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, REVISION_BLOG_REFS_START_DELAY_MS);
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  run(): Promise<RevisionBlogRefsSummary | null> {
    this.running ??= this.runOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce(): Promise<RevisionBlogRefsSummary | null> {
    let client: DedicatedClient | null = null;
    try {
      // drizzle(node-postgres) держит пул в `$client` (src/db/db.ts); тип
      // NodePgDatabase его не объявляет.
      const pool = (this.db as unknown as { $client: ClientPool }).$client;
      client = await pool.connect();
      // Только для этой сессии: строка = отдельный коммит, без ожидания fsync
      // на каждом перевод быстрее (замер на 1 907 строках: 7 с → 4 с). При
      // падении базы теряются
      // лишь последние записи — они остаются в прежнем виде, и следующий старт
      // их переведёт.
      await client.query(`SET synchronous_commit TO off`);
      return await runRevisionBlogRefs(new PgRevisionBlogRefsStore(client), {
        logger: this.logger,
        shouldStop: () => this.stopped,
      });
    } catch (err) {
      this.logger.error(
        `Публикации в ревизиях: перевод прерван — ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    } finally {
      // Соединение закрываем, а не возвращаем в пул: если снять блокировку не
      // удалось, она уйдёт вместе с сессией, а не останется в пуле навсегда.
      client?.release(true);
    }
  }
}
