/**
 * GET /api/sites/:id/audit?page=<id страницы> — последний аудит опубликованной страницы
 * (место проверок `audit`, packages/storefront-builder/src/audit/): сборщик пишет итог
 * аудита после публикации в storefront_audit и отдаёт его здесь же, через sites, как
 * превью. Читает проверяющий процесс (storefront-checker) и кладёт в ответ снимка
 * черновика (`look`), откуда его берёт merfy-mcp. Без авторизации, как превью: адрес
 * внутренний, а отдаёт он числа скорости страницы магазина. Нет аудита — 404.
 */
import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { StorefrontBuilderClient } from "./storefront-builder.client";
import { sendAnswer } from "./storefront-preview.middleware";

@Controller("api/sites/:id/audit")
export class StorefrontAuditController {
  constructor(private readonly builder: StorefrontBuilderClient) {}

  @Get()
  async latest(
    @Param("id") siteId: string,
    @Query("page") page: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    sendAnswer(
      res,
      await this.builder.call("/audit", { shop: siteId, page: page ?? "" }),
    );
  }

  /**
   * GET /api/sites/:id/audit/latest — сводка последней проверенной публикации магазина:
   * { build, measuredAt, regressed, pages: [{ path, pageId, metrics, previous, findings }] }.
   * `regressed` — аудит отработал и есть находка не платформы (то же правило, что у события
   * `audit.regressed`). Аудита ещё не было — 404. Читает шлюз для плашки в конструкторе.
   */
  @Get("latest")
  async summary(
    @Param("id") siteId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendAnswer(res, await this.builder.call("/audit/latest", { shop: siteId }));
  }

  /**
   * GET /api/sites/:id/audit/superseded?build=<номер> — вышла ли после сборки новая живая
   * сборка магазина: проверяющий процесс спрашивает перед прогоном аудита, не вытеснено ли
   * задание. Ответ сборщика: { superseded: boolean }.
   */
  @Get("superseded")
  async superseded(
    @Param("id") siteId: string,
    @Query("build") build: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    sendAnswer(
      res,
      await this.builder.call("/audit/superseded", {
        shop: siteId,
        build: build ?? "",
      }),
    );
  }
}
