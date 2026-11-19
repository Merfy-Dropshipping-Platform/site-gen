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
}
