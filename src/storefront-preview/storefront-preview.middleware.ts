/**
 * Развилка превью и puck-config по признаку «тема новой архитектуры» (design.md
 * блока 8, «Как конструктор узнаёт новую тему»): магазин новой темы получает
 * стенд от сборщика, его тема — схему панели; нынешние темы идут дальше, в
 * PreviewController и ThemePuckConfigController, как раньше. Имён тем здесь
 * нет: новые темы — ключи packages/storefront-build/theme-versions.json
 * (readNewThemeIds, как у StorefrontHandoff блока 6).
 */
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import {
  StorefrontHandoff,
  readNewThemeIds,
} from "../storefront-handoff/storefront-handoff.service";
import {
  StorefrontBuilderClient,
  type BuilderAnswer,
} from "./storefront-builder.client";

const PREVIEW_PATH = /^\/api\/sites\/([^/]+)\/preview\/?$/;
const PUCK_CONFIG_PATH = /^\/api\/themes\/([^/]+)\/puck-config\/?$/;

export function sendAnswer(res: Response, answer: BuilderAnswer): void {
  res
    .status(answer.status)
    .setHeader("Content-Type", answer.contentType)
    .setHeader("Cache-Control", "no-store")
    .send(answer.body);
}

/** GET /api/sites/:id/preview — стенд новой темы от сборщика. */
@Injectable()
export class StandPreviewMiddleware implements NestMiddleware {
  constructor(
    private readonly handoff: StorefrontHandoff,
    private readonly builder: StorefrontBuilderClient,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const siteId = PREVIEW_PATH.exec(req.path)?.[1];
    if (siteId === undefined || !(await this.handoff.isNewTheme(siteId)))
      return next();
    sendAnswer(res, await this.builder.call("/preview", { shop: siteId }));
  }
}

/** GET /api/themes/:themeId/puck-config — схема панели новой темы от сборщика. */
@Injectable()
export class ThemePanelMiddleware implements NestMiddleware {
  private readonly newThemes = readNewThemeIds(process.cwd());

  constructor(private readonly builder: StorefrontBuilderClient) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const themeId = PUCK_CONFIG_PATH.exec(req.path)?.[1];
    if (themeId === undefined || !this.newThemes.has(themeId)) return next();
    sendAnswer(
      res,
      await this.builder.call("/theme-panel", { theme: themeId }),
    );
  }
}
