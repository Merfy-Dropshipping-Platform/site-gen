/**
 * PolicyService -- сервис для работы с политиками магазина.
 *
 * Задачи:
 * - Получение всех политик сайта по siteId
 * - Создание или обновление политики (select + insert/update)
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";

export interface PolicyData {
  id: string;
  siteId: string;
  type: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Получить все политики сайта.
   */
  async getBySiteId(siteId: string): Promise<PolicyData[]> {
    this.logger.log(`getBySiteId: siteId=${siteId}`);

    const rows = await this.db
      .select()
      .from(schema.sitePolicy)
      .where(eq(schema.sitePolicy.siteId, siteId));

    return rows as PolicyData[];
  }

  /**
   * Создать или обновить политику.
   * Так как нет уникального ограничения (site_id, type), используем select + insert/update.
   */
  async upsert(
    siteId: string,
    type: string,
    content: string,
  ): Promise<PolicyData> {
    this.logger.log(`upsert: siteId=${siteId}, type=${type}`);

    const [existing] = await this.db
      .select()
      .from(schema.sitePolicy)
      .where(
        and(
          eq(schema.sitePolicy.siteId, siteId),
          eq(schema.sitePolicy.type, type as any),
        ),
      );

    if (existing) {
      const [updated] = await this.db
        .update(schema.sitePolicy)
        .set({ content, updatedAt: new Date() })
        .where(eq(schema.sitePolicy.id, existing.id))
        .returning();

      return updated as PolicyData;
    }

    const [created] = await this.db
      .insert(schema.sitePolicy)
      .values({
        id: crypto.randomUUID(),
        siteId,
        type: type as any,
        content,
      })
      .returning();

    return created as PolicyData;
  }
}
