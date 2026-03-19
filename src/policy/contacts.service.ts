/**
 * ContactsService -- сервис для работы с контактной информацией магазина.
 *
 * Задачи:
 * - Получение контактов сайта по siteId
 * - Создание или обновление контактов (onConflictDoUpdate по site_id)
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";

export interface ContactField {
  id: string;
  label: string;
  value: string;
  order: number;
}

export interface ContactsData {
  id: string;
  siteId: string;
  fields: ContactField[];
  updatedAt: Date;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Получить контакты сайта.
   */
  async getBySiteId(siteId: string): Promise<ContactsData | null> {
    this.logger.log(`getBySiteId: siteId=${siteId}`);

    const [row] = await this.db
      .select()
      .from(schema.siteContacts)
      .where(eq(schema.siteContacts.siteId, siteId));

    return (row as ContactsData) ?? null;
  }

  /**
   * Создать или обновить контакты.
   * Используем onConflictDoUpdate по уникальному полю site_id.
   */
  async upsert(
    siteId: string,
    fields: ContactField[],
  ): Promise<ContactsData> {
    this.logger.log(`upsert: siteId=${siteId}`);

    const [row] = await this.db
      .insert(schema.siteContacts)
      .values({
        id: crypto.randomUUID(),
        siteId,
        fields,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.siteContacts.siteId,
        set: {
          fields,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row as ContactsData;
  }
}
