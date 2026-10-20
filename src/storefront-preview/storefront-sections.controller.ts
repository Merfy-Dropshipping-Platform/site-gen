/**
 * GET /api/sites/:id/sections (блок 1 «Секций и SDK»): секции, которые магазин
 * новой темы может поставить на страницу, — ответ сборщика как есть
 * ({ sections: [{ name, title, settings }] }). По нему конструктор строит
 * «Добавить секцию» и поля секции. Право на магазин проверяет шлюз.
 */
import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { StorefrontHandoff } from "../storefront-handoff/storefront-handoff.service";
import { StorefrontBuilderClient } from "./storefront-builder.client";
import { sendAnswer } from "./storefront-preview.middleware";

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
}
