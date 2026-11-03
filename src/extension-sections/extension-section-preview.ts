/**
 * Превью секции расширения в кабинете (экран `editor`, поле `preview`): что нужно кабинету, чтобы показать одну
 * секцию расширения в теме магазина. Рисует её тот же сборщик, что и превью конструктора (POST /preview/block), а
 * здесь — только «разведка» перед рисованием, ничего не пишется:
 *
 * - магазин на теме новой архитектуры (иначе `no-theme`);
 * - секция `<расширение>:<имя>` видна магазину — расширение установлено и секция принята (иначе `section-not-found`);
 * - стоит ли она уже в магазине: параметры экземпляра из текущей правки (sites.extension.placements) — кабинет
 *   накладывает на них значения редактора; не стоит — `placement: null`, параметры по умолчанию.
 *
 * Имён расширений и секций в коде нет: расширение и имя секции — из адреса. Право на магазин и на установку проверяет
 * шлюз; сюда ходит только он.
 */
import { Controller, Get, Injectable, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { StorefrontHandoff } from "../storefront-handoff/storefront-handoff.service";
import { StorefrontBuilderClient } from "../storefront-preview/storefront-builder.client";
import { ExtensionPlacements } from "./extension-placements";
import {
  PLACEMENT_LISTS,
  SECTION_NAME_RE,
  type PlacementItem,
} from "./extension-sections.contract";

const EXTENSION_ID_RE = /^[a-z][a-z0-9-]{2,31}$/;

type PreviewGroup = (typeof PLACEMENT_LISTS)[number];

/** Экземпляр секции в магазине: id, где стоит и его параметры как в правке магазина. */
export interface PreviewPlacement {
  id: string;
  list: PreviewGroup;
  page: { id: string; name: string | null } | null;
  hidden: boolean;
  settings: Record<string, unknown>;
}

export type SectionPreviewPlan =
  | {
      state: "ready";
      /** Полное имя: <id расширения>:<имя секции>. */
      section: string;
      title: string | null;
      /** Куда ставить в превью: шапка, страница, подвал или поверх страницы. */
      group: PreviewGroup;
      placement: PreviewPlacement | null;
    }
  | { state: "no-theme" }
  | { state: "section-not-found" }
  | { state: "unavailable"; message: string };

const listSchema = z.object({
  sections: z.array(
    z.looseObject({
      name: z.string(),
      title: z.string().optional(),
      groups: z.array(z.string()).optional(),
      extension: z.looseObject({ id: z.string() }).optional(),
    }),
  ),
});

const isGroup = (value: string): value is PreviewGroup =>
  (PLACEMENT_LISTS as readonly string[]).includes(value);

/** Секция без места в магазине: первая из объявленных групп, кроме обычной страницы; нет — страница. */
function groupOf(declared: readonly string[] | undefined): PreviewGroup {
  const special = (declared ?? []).find(
    (group): group is PreviewGroup => isGroup(group) && group !== "page",
  );
  return special ?? "page";
}

/** Видимый экземпляр важнее скрытого; в остальном — по порядку правки. */
function pick(items: readonly PlacementItem[]): PlacementItem | null {
  return items.find((item) => !item.hidden) ?? items[0] ?? null;
}

@Injectable()
export class ExtensionSectionPreview {
  constructor(
    private readonly handoff: StorefrontHandoff,
    private readonly builder: StorefrontBuilderClient,
    private readonly placements: ExtensionPlacements,
  ) {}

  /** Не бросает: любой сбой — `unavailable` с причиной. */
  async plan(
    shopId: string,
    extensionId: string,
    name: string,
  ): Promise<SectionPreviewPlan> {
    if (!EXTENSION_ID_RE.test(extensionId) || !SECTION_NAME_RE.test(name))
      return { state: "section-not-found" };
    if (!(await this.handoff.isNewTheme(shopId))) return { state: "no-theme" };
    const answer = await this.builder.call("/sections", { shop: shopId });
    if (answer.status !== 200)
      return {
        state: "unavailable",
        message: `сборщик витрин ответил ${answer.status}`,
      };
    const full = `${extensionId}:${name}`;
    const found = parseList(answer.body).find(
      (section) => section.name === full,
    );
    if (found === undefined) return { state: "section-not-found" };
    const placed = await this.placements.list({
      shopId,
      extensionId,
      section: name,
    });
    if (!placed.success)
      return { state: "unavailable", message: placed.message };
    const item = pick(placed.data.items);
    return {
      state: "ready",
      section: full,
      title: found.title ?? null,
      group: item === null ? groupOf(found.groups) : item.list,
      placement:
        item === null
          ? null
          : {
              id: item.id,
              list: item.list,
              page: item.page,
              hidden: item.hidden,
              settings: item.settings,
            },
    };
  }
}

function parseList(body: string) {
  try {
    const parsed = listSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data.sections : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/sites/:id/extensions/:extensionId/sections/:name/preview — план превью секции расширения. Состояния
 * ready, no-theme, section-not-found — 200 (это ответы, а не сбои); unavailable — 502.
 */
@Controller("api/sites/:id/extensions/:extensionId/sections/:name")
export class ExtensionSectionPreviewController {
  constructor(private readonly preview: ExtensionSectionPreview) {}

  @Get("preview")
  async plan(
    @Param("id") shopId: string,
    @Param("extensionId") extensionId: string,
    @Param("name") name: string,
    @Res() res: Response,
  ): Promise<void> {
    const plan = await this.preview.plan(shopId, extensionId, name);
    res
      .status(plan.state === "unavailable" ? 502 : 200)
      .setHeader("Cache-Control", "no-store")
      .json(plan);
  }
}
