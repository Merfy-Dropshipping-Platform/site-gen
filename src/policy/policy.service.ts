/**
 * PolicyService -- сервис для работы с политиками магазина.
 *
 * Задачи:
 * - Получение всех политик сайта по siteId
 * - Создание или обновление политики (select + insert/update)
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, isNull } from "drizzle-orm";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { setExtensionBlock } from "./extension-block";

/** Типы политик, в которые расширения могут дописывать свой блок. */
const EXTENSION_POLICY_TYPES = ["privacy", "tos"] as const;
type ExtensionPolicyType = (typeof EXTENSION_POLICY_TYPES)[number];

/** Тексты блока расширения по типам политик; `null` -- убрать блок из обоих. */
export type ExtensionPolicyBlocks =
  | {
      [K in ExtensionPolicyType]?: string;
    }
  | null;

/** Что менять по типам: null -- снять блок везде, иначе только присутствующие ключи. */
function extensionBlockChanges(
  blocks: ExtensionPolicyBlocks,
): Array<[ExtensionPolicyType, string | null]> {
  if (blocks === null) {
    return EXTENSION_POLICY_TYPES.map((type) => [type, null]);
  }
  return EXTENSION_POLICY_TYPES.filter(
    (type) => blocks[type] !== undefined,
  ).map((type) => [type, blocks[type] as string]);
}

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

  /**
   * Дописать/заменить/убрать блок расширения в политиках всех сайтов
   * арендатора (privacy, tos). Вызывается сервисом `extensions` при
   * включении (blocks с текстами) и выключении (blocks === null) расширения.
   *
   * `blocks === null` -- убрать блок из privacy и tos. Иначе трогаем только
   * типы, чьи ключи присутствуют в blocks: строка -- вставить/заменить,
   * отсутствующий ключ -- не трогать. Пишем только те записи, где контент
   * реально изменился.
   */
  async setExtensionBlocks(
    tenantId: string,
    extensionId: string,
    blocks: ExtensionPolicyBlocks,
  ): Promise<{ sites: number }> {
    this.logger.log(
      `setExtensionBlocks: tenantId=${tenantId}, extensionId=${extensionId}, remove=${blocks === null}`,
    );

    const siteIds = await this.listTenantSiteIds(tenantId);
    const changes = extensionBlockChanges(blocks);

    for (const siteId of siteIds) {
      const existingPolicies = await this.getBySiteId(siteId);

      for (const [type, desiredText] of changes) {
        const current =
          existingPolicies.find((p) => p.type === type)?.content ?? "";
        const next = setExtensionBlock(current, extensionId, desiredText);

        if (next === current) continue;

        await this.upsert(siteId, type, next);
      }
    }

    return { sites: siteIds.length };
  }

  /**
   * Все id сайтов арендатора, без пагинации (в отличие от `SitesService.list`,
   * где cursor зарезервирован на будущее и сейчас ни на что не влияет --
   * см. комментарий в sites.service.ts). Тот же предикат, что и в
   * `SitesService.list`: активные (не удалённые) сайты арендатора.
   */
  private async listTenantSiteIds(tenantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(
        and(eq(schema.site.tenantId, tenantId), isNull(schema.site.deletedAt)),
      );

    return rows.map((row) => row.id);
  }
}
