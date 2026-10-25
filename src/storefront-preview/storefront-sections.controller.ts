/**
 * Секции магазина новой темы (блоки 1 и 14 «Секций и SDK»): ответы сборщика как есть. Право на магазин и организацию
 * проверяет шлюз; sites проверяет, что магазин на теме новой архитектуры.
 *
 * - GET  /api/sites/:id/sections — секции для «Добавить секцию» (блок 1, ответ { sections }).
 * - POST /api/sites/:id/sections/check — проверить файлы { files }, ничего не записывая (блок 14).
 * - POST /api/sites/:id/sections — сохранить { files } своей секцией магазина, черновиком.
 * - GET  /api/sites/:id/sections/:name/source и …/history; POST …/:name/rollback с { id }.
 *
 * Договор тел и ответов — packages/storefront-builder/src/section-tools.ts.
 */
import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { StorefrontHandoff } from "../storefront-handoff/storefront-handoff.service";
import { StorefrontBuilderClient } from "./storefront-builder.client";
import { sendAnswer } from "./storefront-preview.middleware";

// Проверка и сохранение — сборка в отдельном процессе до 10 с и два пробных рендера (блок 14, Р14-18).
export const SECTION_TOOL_TIMEOUT_MS = 30_000;

const NOT_NEW_THEME = {
  ok: false,
  error: {
    code: "shop-not-found",
    message: "магазин не на теме новой архитектуры",
  },
} as const;

@Controller("api/sites/:id/sections")
export class StorefrontSectionsController {
  constructor(
    private readonly handoff: StorefrontHandoff,
    private readonly builder: StorefrontBuilderClient,
  ) {}

  @Get()
  async list(@Param("id") siteId: string, @Res() res: Response): Promise<void> {
    if (!(await this.handoff.isNewTheme(siteId))) {
      res
        .status(404)
        .json({ problems: ["магазин не на теме новой архитектуры"] });
      return;
    }
    sendAnswer(res, await this.builder.call("/sections", { shop: siteId }));
  }

  @Post("check")
  async check(
    @Param("id") siteId: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    await this.tool(res, siteId, "/sections/check", {}, body);
  }

  @Post()
  async save(
    @Param("id") siteId: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    await this.tool(res, siteId, "/sections/save", {}, body);
  }

  @Get(":name/source")
  async source(
    @Param("id") siteId: string,
    @Param("name") name: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tool(res, siteId, "/sections/source", { name });
  }

  @Get(":name/history")
  async history(
    @Param("id") siteId: string,
    @Param("name") name: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tool(res, siteId, "/sections/history", { name });
  }

  @Post(":name/rollback")
  async rollback(
    @Param("id") siteId: string,
    @Param("name") name: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    await this.tool(res, siteId, "/sections/rollback", { name }, body);
  }

  private async tool(
    res: Response,
    siteId: string,
    path: string,
    query: Record<string, string>,
    body?: unknown,
  ): Promise<void> {
    if (!(await this.handoff.isNewTheme(siteId))) {
      res.status(404).json(NOT_NEW_THEME);
      return;
    }
    const text = body === undefined ? undefined : JSON.stringify(body ?? {});
    sendAnswer(
      res,
      await this.builder.call(
        path,
        { shop: siteId, ...query },
        text,
        SECTION_TOOL_TIMEOUT_MS,
      ),
    );
  }
}
