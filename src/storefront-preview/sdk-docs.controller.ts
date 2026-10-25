/**
 * GET /api/storefront/sdk?file=<путь> (блок 14 «Секций и SDK», Р14-15) — файл документации SDK от сборщика витрин:
 * тот же образ, что проверяет секции. Без входа: шлюз отдаёт документацию всем (В14-2 А) и ставит кеш и ETag.
 */
import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { StorefrontBuilderClient } from "./storefront-builder.client";
import { sendAnswer } from "./storefront-preview.middleware";

@Controller("api/storefront/sdk")
export class SdkDocsController {
  constructor(private readonly builder: StorefrontBuilderClient) {}

  @Get()
  async file(
    @Query("file") file: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const path = typeof file === "string" ? file : "";
    sendAnswer(res, await this.builder.call("/sdk-docs", { file: path }));
  }
}
