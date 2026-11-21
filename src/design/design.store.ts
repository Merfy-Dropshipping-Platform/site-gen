/**
 * Хранилище «Дизайна по ссылке» (drizzle/0040): design_looks и design_owned_sites. Пишет и читает только RPC `design.*`
 * (design.controller.ts). Раз в сутки удаляет снимки старше 30 дней: они нужны для кэша шлюза (24 ч) и для разбора,
 * а не навсегда.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import {
  LOOK_RETENTION_DAYS,
  RAW_LIMIT_BYTES,
  type SaveLookInput,
  type StoredLook,
} from "./design.contract";

const DAY_MS = 24 * 60 * 60 * 1000;

type LookRow = Pick<
  typeof schema.designLooks.$inferSelect,
  "id" | "url" | "style" | "outline" | "content" | "createdAt"
>;

const json = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};

export function storedOf(row: LookRow): StoredLook {
  return {
    id: row.id,
    url: row.url,
    style: json(row.style),
    outline: json(row.outline),
    content: row.content === null ? null : json(row.content),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Сырой ответ больше предела — отметка с размером вместо него. */
export function cappedRaw(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const bytes = Buffer.byteLength(JSON.stringify(raw), "utf8");
  return bytes <= RAW_LIMIT_BYTES ? raw : { truncated: true, bytes };
}

const PUBLIC_COLUMNS = {
  id: schema.designLooks.id,
  url: schema.designLooks.url,
  style: schema.designLooks.style,
  outline: schema.designLooks.outline,
  content: schema.designLooks.content,
  createdAt: schema.designLooks.createdAt,
};

@Injectable()
export class DesignStore {
  private readonly logger = new Logger(DesignStore.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async save(input: SaveLookInput): Promise<string> {
    const id = randomUUID();
    await this.db.insert(schema.designLooks).values({
      id,
      ...input,
      raw: cappedRaw(input.raw),
    });
    return id;
  }

  async get(siteId: string, lookId: string): Promise<StoredLook | null> {
    const [row] = await this.db
      .select(PUBLIC_COLUMNS)
      .from(schema.designLooks)
      .where(
        and(
          eq(schema.designLooks.id, lookId),
          eq(schema.designLooks.siteId, siteId),
        ),
      )
      .limit(1);
    return row === undefined ? null : storedOf(row);
  }

  async findRecent(
    siteId: string,
    url: string,
    maxAgeMs: number,
    now = new Date(),
  ): Promise<StoredLook | null> {
    const since = new Date(now.getTime() - maxAgeMs);
    const [row] = await this.db
      .select(PUBLIC_COLUMNS)
      .from(schema.designLooks)
      .where(
        and(
          eq(schema.designLooks.siteId, siteId),
          eq(schema.designLooks.url, url),
          gte(schema.designLooks.createdAt, since),
        ),
      )
      .orderBy(desc(schema.designLooks.createdAt))
      .limit(1);
    return row === undefined ? null : storedOf(row);
  }

  async confirmOwned(
    siteId: string,
    domain: string,
    userId: string,
  ): Promise<void> {
    const confirmedAt = new Date();
    await this.db
      .insert(schema.designOwnedSites)
      .values({ siteId, domain, userId, confirmedAt })
      .onConflictDoUpdate({
        target: [
          schema.designOwnedSites.siteId,
          schema.designOwnedSites.domain,
        ],
        set: { userId, confirmedAt },
      });
  }

  async isOwned(siteId: string, domain: string): Promise<boolean> {
    const [row] = await this.db
      .select({ siteId: schema.designOwnedSites.siteId })
      .from(schema.designOwnedSites)
      .where(
        and(
          eq(schema.designOwnedSites.siteId, siteId),
          eq(schema.designOwnedSites.domain, domain),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /** Удалить снимки старше срока; вернуть, сколько удалено. */
  async purge(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - LOOK_RETENTION_DAYS * DAY_MS);
    const removed = await this.db
      .delete(schema.designLooks)
      .where(lt(schema.designLooks.createdAt, before))
      .returning({ id: schema.designLooks.id });
    return removed.length;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeDaily(): Promise<void> {
    try {
      const removed = await this.purge();
      this.logger.log(
        `design_looks: удалено снимков старше ${LOOK_RETENTION_DAYS} дней — ${removed}`,
      );
    } catch (error) {
      this.logger.error(`design_looks: чистка не прошла — ${String(error)}`);
    }
  }
}
