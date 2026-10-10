/**
 * POST /api/sites/:id/preview/tokens (design.md блока 8, «Правка токенов без
 * перезагрузки»): слушатель на стенде превью шлёт сюда правки токенов из
 * конструктора и получает { css, attributes }. Ручка — только для магазинов
 * новой темы; без авторизации, как нынешняя tokens-css: считает CSS по
 * присланным правкам и теме магазина, данных магазина не отдаёт. Старая
 * ручка tokens-css не меняется.
 */
import { Body, Controller, HttpCode, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { StorefrontHandoff } from "../storefront-handoff/storefront-handoff.service";
import { StorefrontBuilderClient } from "./storefront-builder.client";
import { sendAnswer } from "./storefront-preview.middleware";

@Controller("api/sites/:id/preview")
export class StorefrontPreviewController {
  constructor(
    private readonly handoff: StorefrontHandoff,
    private readonly builder: StorefrontBuilderClient,
  ) {}

  @Post("tokens")
  @HttpCode(200)
  async tokens(
    @Param("id") siteId: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    if (!(await this.handoff.isNewTheme(siteId))) {
      res
        .status(404)
        .json({ problems: ["магазин не на теме новой архитектуры"] });
      return;
    }
    sendAnswer(
      res,
      await this.builder.call(
        "/preview/tokens",
        { shop: siteId },
        JSON.stringify(body ?? {}),
      ),
    );
  }
}
