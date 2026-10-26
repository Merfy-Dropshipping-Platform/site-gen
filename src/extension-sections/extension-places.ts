/**
 * Место по умолчанию секций расширений (блок 12 «Секций и SDK», часть 12д,
 * Р12д-12…Р12д-14): после включения расширения sites ставит экземпляры его
 * секций с autoPlace обычной записью ревизии через порт StoreContent — так же,
 * как сброс контент-страниц (sites.service.ts, resetContentPagesOnce). Маршрут
 * сборщика — packages/storefront-builder/src/extension-places.ts. Имён
 * расширений здесь нет: место приходит с префиксом имени секции.
 */
import { and, eq, isNull } from "drizzle-orm";
import { Inject, Injectable } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { rewriteCurrent } from "../content/rewrite-current";
import { StoreContentService } from "../content/store-content.service";
import { toStoreContentSite } from "../content/store-content.port";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import type { StorefrontBuilderClient } from "../storefront-preview/storefront-builder.client";

export const PLACES_PATH = "/sections/places";

export interface ExtensionPlace {
  section: string;
  autoPlace: string;
  hosts: string[];
}

export type PlaceOutcome =
  | { status: "placed"; sections: string[] }
  | { status: "none" }
  | { status: "failed"; reason: string };

// Ответ сборщика: места секций расширений с autoPlace и секции-хозяева мест блоков.
const placesSchema = z.object({
  places: z.array(
    z.object({
      section: z.string().min(1),
      autoPlace: z.string().min(1),
      hosts: z.array(z.string()),
    }),
  ),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Экземпляр этой секции уже есть на любой странице (элемент-объект с тем же section, hidden не важен — Р12д-13).
const hasInstance = (
  pages: readonly (readonly [string, readonly unknown[]])[],
  section: string,
): boolean =>
  pages.some(([, list]) =>
    list.some((item) => isRecord(item) && item.section === section),
  );

// Индекс первого элемента-объекта с section из hosts; не найден — -1.
const hostIndex = (
  list: readonly unknown[],
  hosts: readonly string[],
): number =>
  list.findIndex(
    (item) => isRecord(item) && hosts.includes(String(item.section)),
  );

/**
 * Ключ sections документа: для каждого места по порядку — экземпляр сразу
 * после первого объекта-хозяина на первой странице (по порядку ключей), где
 * хозяин есть. Списки — новые массивы, остальное как было. Ничего не
 * добавлено — null.
 */
export function placedSections(
  sections: unknown,
  places: readonly ExtensionPlace[],
  idOf: (base: string) => string,
): { sections: Record<string, unknown[]>; added: string[] } | null {
  if (!isRecord(sections)) return null;
  const pages = Object.entries(sections).filter(
    (entry): entry is [string, unknown[]] => Array.isArray(entry[1]),
  );
  const next: Record<string, unknown[]> = {};
  for (const [page, list] of pages) next[page] = [...list];
  const added: string[] = [];
  for (const place of places) {
    if (hasInstance(pages, place.section)) continue;
    const target = pages.find(([, list]) => hostIndex(list, place.hosts) >= 0);
    if (target === undefined) continue;
    const [page, list] = target;
    const base = place.section.slice(place.section.indexOf(":") + 1);
    next[page].splice(hostIndex(list, place.hosts) + 1, 0, {
      id: idOf(base),
      section: place.section,
      settings: {},
    });
    added.push(place.section);
  }
  return added.length === 0 ? null : { sections: next, added };
}

// id — как у секции новой страницы (pages.service.ts, newPageSections): база до 31 знака и 8 hex.
export const instanceIdOf = (base: string): string =>
  `${base.slice(0, 31)}-${randomBytes(4).toString("hex")}`;

interface PlaceSiteRow {
  id: string;
  tenantId: string;
  themeId: string | null;
  currentRevisionId: string | null;
  publicUrl: string | null;
  name: string | null;
  contentModel: string | null;
}

@Injectable()
export class ExtensionPlaces {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly builder: StorefrontBuilderClient,
    private readonly content: StoreContentService,
  ) {}

  // Не бросает: любая ошибка — failed с текстом, включение расширения не откатывается (как у политики).
  async place(shopId: string, extensionId: string): Promise<PlaceOutcome> {
    try {
      const answer = await this.builder.call(PLACES_PATH, { shop: shopId });
      if (answer.status !== 200)
        return { status: "failed", reason: `сборщик ответил ${answer.status}` };
      const parsed = placesSchema.safeParse(JSON.parse(answer.body));
      if (!parsed.success)
        return { status: "failed", reason: "ответ сборщика не той формы" };
      const prefix = `${extensionId}:`;
      const mine = parsed.data.places.filter((place) =>
        place.section.startsWith(prefix),
      );
      if (mine.length === 0) return { status: "none" };
      return await rewriteCurrent(() =>
        this.placeOnce(shopId, extensionId, mine),
      );
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async placeOnce(
    shopId: string,
    extensionId: string,
    places: readonly ExtensionPlace[],
  ): Promise<PlaceOutcome> {
    const site = await this.siteOf(shopId);
    if (site === null || site.currentRevisionId === null)
      return { status: "none" };
    const revision = await this.content.load(shopId, {
      site: toStoreContentSite(site),
      asStored: true,
    });
    const placed = placedSections(
      revision.document.sections,
      places,
      instanceIdOf,
    );
    if (placed === null) return { status: "none" };
    await this.content.save(shopId, {
      mode: "on-base",
      document: { ...revision.document, sections: placed.sections },
      base: revision.version,
      tenantId: site.tenantId,
      actor: "system",
      source: "ops",
      mergePolicy: "reject-conflicts",
      meta: {
        operation: "extension-place",
        extension: extensionId,
        sections: placed.added,
      },
      site: toStoreContentSite(site),
    });
    return { status: "placed", sections: placed.added };
  }

  // Строка сайта по id без deletedAt; тест подменяет цепочку select → from → where.
  private async siteOf(shopId: string): Promise<PlaceSiteRow | null> {
    const rows = await this.db
      .select({
        id: schema.site.id,
        tenantId: schema.site.tenantId,
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
