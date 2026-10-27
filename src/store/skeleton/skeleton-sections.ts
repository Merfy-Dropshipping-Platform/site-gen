/**
 * Порты команды заготовки (`PlaceSkeleton`): секции магазина и блокировка магазина.
 *
 * Секции. Свою секцию магазина принимает сборщик витрин: сборка шаблона и два пробных рендера идут в его песочнице
 * процессов (`acceptSection`, пакет storefront-sections), в образе sites её нет. Поэтому sites отдаёт файлы сборщику
 * тем же внутренним адресом, что и «Сохранить секцию» (`POST /sections/save?shop=`), — без шлюза и его лимита
 * 30 сохранений в минуту. Какие секции у магазина уже есть — из реестра `storefront_section` (та же база).
 *
 * Блокировка. Две заготовки одного магазина разом поставили бы секции дважды: обе видят пустые списки. Заготовка идёт
 * под `pg_try_advisory_xact_lock` по ключу магазина — тот же механизм, что у блокировки тенанта в `CreateStore`
 * (`store-registry.ts`); занято — команда отвечает `skeleton_in_progress`, а не ждёт.
 */
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../../constants";
import * as schema from "../../db/schema";
import { StorefrontBuilderClient } from "../../storefront-preview/storefront-builder.client";
import { SECTION_TOOL_TIMEOUT_MS } from "../../storefront-preview/storefront-sections.controller";

export interface ShopSection {
  /** Имя без префикса: `faq`. */
  name: string;
  role: string | null;
}

export type SaveOutcome = { ok: true } | { ok: false; reason: string };

export interface SkeletonSections {
  /** Свои секции магазина (текущие правки). */
  present(siteId: string): Promise<ShopSection[]>;
  /** Сохранить файлы своей секцией магазина, черновиком. */
  save(siteId: string, files: Record<string, string>): Promise<SaveOutcome>;
}

export const SKELETON_SECTIONS = Symbol("SKELETON_SECTIONS");

export interface SkeletonLock {
  /** Работа под блокировкой магазина; блокировка занята — `{ locked: false }`, работа не запускается. */
  withSiteLock<T>(
    siteId: string,
    work: () => Promise<T>,
  ): Promise<{ locked: true; value: T } | { locked: false }>;
}

export const SKELETON_LOCK = Symbol("SKELETON_LOCK");

const SHOP_PREFIX = "shop:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Почему сборщик не принял секцию — первая проблема проверки или текст ошибки инструмента. */
export function refusalOf(status: number, body: string): string {
  const value = parse(body);
  if (isRecord(value)) {
    const problems = Array.isArray(value.problems) ? value.problems : [];
    const first = problems.find(isRecord);
    if (first && typeof first.message === "string") return first.message;
    if (isRecord(value.error) && typeof value.error.message === "string")
      return value.error.message;
  }
  return `сборщик витрин ответил ${status}`;
}

@Injectable()
export class BuilderSkeletonSections implements SkeletonSections {
  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Inject(StorefrontBuilderClient)
    private readonly builder: Pick<StorefrontBuilderClient, "call">,
  ) {}

  async present(siteId: string): Promise<ShopSection[]> {
    const rows = await this.db
      .select({
        name: schema.storefrontSection.name,
        role: sql<string | null>`${schema.storefrontSection.manifest}->>'role'`,
      })
      .from(schema.storefrontSection)
      .where(
        and(
          eq(schema.storefrontSection.author, "shop"),
          eq(schema.storefrontSection.owner, siteId),
          eq(schema.storefrontSection.draft, true),
        ),
      );
    return rows.map((row) => ({
      name: row.name.startsWith(SHOP_PREFIX)
        ? row.name.slice(SHOP_PREFIX.length)
        : row.name,
      role: row.role ?? null,
    }));
  }

  async save(
    siteId: string,
    files: Record<string, string>,
  ): Promise<SaveOutcome> {
    const answer = await this.builder.call(
      "/sections/save",
      { shop: siteId },
      JSON.stringify({ files }),
      SECTION_TOOL_TIMEOUT_MS,
    );
    const value = parse(answer.body);
    if (answer.status === 200 && isRecord(value) && value.ok === true)
      return { ok: true };
    return { ok: false, reason: refusalOf(answer.status, answer.body) };
  }
}

@Injectable()
export class DrizzleSkeletonLock implements SkeletonLock {
  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async withSiteLock<T>(
    siteId: string,
    work: () => Promise<T>,
  ): Promise<{ locked: true; value: T } | { locked: false }> {
    return this.db.transaction(async (tx) => {
      // Транзакционная блокировка снимается сама на COMMIT/ROLLBACK. Работа пишет своими соединениями: транзакция
      // только держит ключ.
      const result = await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`sites:place_skeleton:${siteId}`}, 0)) AS locked`,
      );
      const row = (result as unknown as { rows?: { locked?: boolean }[] })
        .rows?.[0];
      if (row?.locked !== true) return { locked: false as const };
      return { locked: true as const, value: await work() };
    });
  }
}
