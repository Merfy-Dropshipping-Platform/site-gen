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

/** Указатель магазина в хранилище витрин (сборщик: GET /pointer). */
export interface ShopPointer {
  /** Номер выложенной сборки. */
  build: number;
  /** Выкладка магазина на паузе. */
  paused: boolean;
  /** Номер сборки, которая ждёт снятия паузы. */
  pending: number | null;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function shopPointerOf(value: unknown): ShopPointer | null {
  if (typeof value !== "object" || value === null) return null;
  const { build, paused, pending } = value as Record<string, unknown>;
  if (!isNumber(build) || typeof paused !== "boolean") return null;
  if (pending !== null && !isNumber(pending)) return null;
  return { build, paused, pending };
}

@Injectable()
export class StorefrontBuilderClient {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>(BUILDER_URL_VARIABLE) ?? "").replace(
      /\/+$/,
      "",
    );
  }

  /**
   * Указатель магазина: что сейчас выложено и стоит ли выкладка на паузе.
   * Сборщика нет в настройках, он недоступен, молчит дольше таймаута, у магазина
   * нет указателя или ответ не по формату — null (текущее состояние неизвестно).
   */
  async pointerOf(siteId: string): Promise<ShopPointer | null> {
    const answer = await this.call("/pointer", { shop: siteId });
    if (answer.status !== 200) return null;
    try {
      const value: unknown = JSON.parse(answer.body);
      return shopPointerOf(value);
    } catch {
      return null;
    }
  }

  /** GET или POST к сборщику; сборщик молчит дольше 10 с или недоступен — 502. */
  async call(
    path: string,
    query: Record<string, string>,
    body?: string,
    timeoutMs = TIMEOUT_MS,
  ): Promise<BuilderAnswer> {
    if (this.baseUrl === "") return NO_BUILDER;
    const url = `${this.baseUrl}${path}?${new URLSearchParams(query).toString()}`;
    const init: RequestInit = {
      method: body === undefined ? "GET" : "POST",
      body,
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
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
