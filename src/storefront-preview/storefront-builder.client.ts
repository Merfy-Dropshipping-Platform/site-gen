/**
 * Клиент сборщика витрин для превью конструктора (design.md блока 8
 * «Каркаса витрины», «Превью»). Превью магазина новой темы рисует сборщик —
 * тем же рисовальщиком темы, что и магазин (в образе sites рисовальщика нет,
 * он только в образе сборщика, блок 6). sites отдаёт его ответы как есть по
 * нынешним адресам превью и puck-config.
 *
 * Адрес — STOREFRONT_BUILDER_URL (внутренний адрес приложения сборщика в
 * Coolify, порт 8080). Не задан — превью новой темы отвечает 503 и говорит,
 * какой переменной нет; нынешние темы это не задевает.
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export const BUILDER_URL_VARIABLE = "STOREFRONT_BUILDER_URL";
const TIMEOUT_MS = 10_000;

export interface BuilderAnswer {
  status: number;
  contentType: string;
  body: string;
}

const NO_BUILDER: BuilderAnswer = {
  status: 503,
  contentType: "text/plain; charset=utf-8",
  body: `превью новой темы не настроено: нет ${BUILDER_URL_VARIABLE}`,
};

const UNREACHABLE: BuilderAnswer = {
  status: 502,
  contentType: "text/plain; charset=utf-8",
  body: "сборщик витрин не ответил",
};

@Injectable()
export class StorefrontBuilderClient {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>(BUILDER_URL_VARIABLE) ?? "").replace(
      /\/+$/,
      "",
    );
  }

  /** GET или POST к сборщику; сборщик молчит дольше 10 с или недоступен — 502. */
  async call(
    path: string,
    query: Record<string, string>,
    body?: string,
  ): Promise<BuilderAnswer> {
    if (this.baseUrl === "") return NO_BUILDER;
    const url = `${this.baseUrl}${path}?${new URLSearchParams(query).toString()}`;
    const init: RequestInit = {
      method: body === undefined ? "GET" : "POST",
      body,
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    try {
      const response = await fetch(url, init);
      const contentType =
        response.headers.get("content-type") ?? "text/plain; charset=utf-8";
      return {
        status: response.status,
        contentType,
        body: await response.text(),
      };
    } catch {
      return UNREACHABLE;
    }
  }
}
