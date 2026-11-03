/**
 * Где стоят секции расширения (RPC sites.extension.placements): функция расширения из кабинета спрашивает, в каких
 * местах магазина стоят экземпляры СВОИХ секций. Запрос приходит от extensions после проверки права sections.read в
 * манифесте; здесь — только чтение текущей правки магазина (ключ sections документа), ничего не пишется. Имён
 * расширений в коде нет: секции расширения отбираются по префиксу `<extensionId>:`.
 */
import { and, eq, isNull } from "drizzle-orm";
import { Inject, Injectable } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../constants";
import { toStoreContentSite } from "../content/store-content.port";
import { StoreContentService } from "../content/store-content.service";
import * as schema from "../db/schema";
import {
  PLACEMENTS_LIMIT,
  PLACEMENT_LISTS,
  type PlacementItem,
  type PlacementsData,
  type PlacementsReply,
  type PlacementsRequest,
} from "./extension-sections.contract";

type PlacementList = (typeof PLACEMENT_LISTS)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Ключи sections, которые не страницы: шапка, подвал и «Поверх страниц» (revision-pages.ts, RESERVED_IDS).
const LIST_OF_KEY: Readonly<Record<string, PlacementList>> = {
  header: "header",
  footer: "footer",
  overlay: "overlay",
};

/** Название страницы по id из ключа pages документа; нет записи или имени — null. */
function pageNamesOf(pages: unknown): Map<string, string | null> {
  const names = new Map<string, string | null>();
  if (!Array.isArray(pages)) return names;
  for (const page of pages) {
    if (!isRecord(page) || typeof page.id !== "string") continue;
    names.set(page.id, typeof page.name === "string" ? page.name : null);
  }
  return names;
}

/**
 * Экземпляры секций расширения из ключа sections документа: по порядку ключей и позиций в списке. Секция другого
 * расширения и секция магазина не попадают. Записи не той формы пропускаются. Больше PLACEMENTS_LIMIT не отдаётся.
 */
export function placementItemsOf(
  document: Record<string, unknown>,
  extensionId: string,
  section?: string,
): PlacementItem[] {
  const sections = document.sections;
  if (!isRecord(sections)) return [];
  const names = pageNamesOf(document.pages);
  const wanted = section === undefined ? null : `${extensionId}:${section}`;
  const prefix = `${extensionId}:`;
  const items: PlacementItem[] = [];
  for (const [key, list] of Object.entries(sections)) {
    if (!Array.isArray(list)) continue;
    const kind: PlacementList = LIST_OF_KEY[key] ?? "page";
    for (const item of list) {
      if (items.length >= PLACEMENTS_LIMIT) return items;
      if (!isRecord(item)) continue;
      const { id, section: full } = item;
      if (typeof id !== "string" || id === "" || typeof full !== "string")
        continue;
      if (wanted === null ? !full.startsWith(prefix) : full !== wanted)
        continue;
      items.push({
        id,
        section: full.slice(prefix.length),
        list: kind,
        page:
          kind === "page" ? { id: key, name: names.get(key) ?? null } : null,
        hidden: item.hidden === true,
        settings: isRecord(item.settings) ? item.settings : {},
      });
    }
  }
  return items;
}

@Injectable()
export class ExtensionPlacements {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly content: StoreContentService,
  ) {}

  /** Не бросает: нет магазина — not_found, сбой чтения — unavailable. */
  async list(request: PlacementsRequest): Promise<PlacementsReply> {
    try {
      const site = await this.siteOf(request.shopId);
      if (site === null)
        return {
          success: false,
          code: "not_found",
          message: "магазин не найден",
        };
      if (site.currentRevisionId === null)
        return { success: true, data: { revision: null, items: [] } };
      const contentSite = toStoreContentSite(site);
      const revision = await this.content.load(request.shopId, {
        site: contentSite,
      });
      const envelope = await this.content.envelopeOrNull(
        request.shopId,
        revision.version,
        { site: contentSite },
      );
      const data: PlacementsData = {
        revision: {
          id: revision.version,
          createdAt: envelope?.createdAt.toISOString() ?? "",
        },
        items: placementItemsOf(
          revision.document,
          request.extensionId,
          request.section,
        ),
      };
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        code: "unavailable",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Строка сайта по id без deletedAt; тест подменяет цепочку select → from → where.
  private async siteOf(shopId: string) {
    const rows = await this.db
      .select({
        id: schema.site.id,
        themeId: schema.site.themeId,
        currentRevisionId: schema.site.currentRevisionId,
        publicUrl: schema.site.publicUrl,
        name: schema.site.name,
        contentModel: schema.site.contentModel,
      })
      .from(schema.site)
      .where(and(eq(schema.site.id, shopId), isNull(schema.site.deletedAt)));
    return rows[0] ?? null;
  }
}
