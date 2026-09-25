/**
 * «Сцена» — страница, на которой идёт замер: живой стенд ИЛИ локальный рендер
 * секции. Один и тот же зонд обязан работать на обеих.
 *
 * Калибровки, зашитые здесь (все пойманы на практике):
 *   • ОПОРА ЗАМЕРА — ЗАДАННАЯ ширина окна, а не измеренная. `window.innerWidth`
 *     растёт вместе с выходом контента за край и прячет переполнение; поэтому
 *     сцена помнит `declaredWidth` и отдаёт его зондам.
 *   • ВЫСОТА ОКНА ВЫШЕ СОДЕРЖИМОГО. Щель «не до конца» на окне 1000px = 22px, а
 *     на 1400px = 422px: короткое окно прячет баги раскладки. Сцена после
 *     загрузки сама поднимает окно выше документа.
 *   • Локальный рендер отдаётся по http, а не через `setContent`: модульные
 *     скрипты тем (корзина, дровер, поиск) на `file://`/`about:blank` браузер не
 *     исполняет, и «ничего не открылось» выглядело бы багом темы.
 *   • Внешняя сеть в локальном режиме заглушена — замер не должен зависеть от
 *     доступности MinIO.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { chromium, type Browser, type Page } from "playwright";

import { loadTesterSchemes, schemeNum, tokensCssFor, sniffTokensCss } from "./schemes";
import { pageHtml, renderBlock } from "./render";

/** Окно по умолчанию: десктоп и ЗАВЕДОМО ВЫСОКОЕ. */
export const DEFAULT_WIDTH = 1440;
export const DEFAULT_HEIGHT = 1600;

export type LiveSpec = {
  kind: "live";
  url: string;
  width?: number;
  height?: number;
  /** Что положить в localStorage до загрузки (корзина, избранное). */
  storage?: Record<string, unknown>;
};

export type LocalSpec = {
  kind: "local";
  theme: string;
  blocks: Array<{ block: string; props?: Record<string, unknown> }>;
  schemeId?: string | number | null;
  schemes?: Array<Record<string, unknown>>;
  width?: number;
  height?: number;
  storage?: Record<string, unknown>;
};

export type StageSpec = LiveSpec | LocalSpec;

export type Stage = {
  page: Page;
  /** ЗАДАННАЯ ширина окна — неподвижная опора замера переполнения. */
  declaredWidth: number;
  declaredHeight: number;
  label: string;
  /** tokens.css сцены: локально — построенный, на живом стенде — снятый со страницы. */
  tokensCss: string | null;
  close: () => Promise<void>;
};

/** Заглушка хелпера esbuild: см. комментарий в openStage. */
const SHIM_NAME = "globalThis.__name = globalThis.__name || function (f) { return f; };";

// Запоминаем ОБЕЩАНИЕ запуска, а не браузер: замеры идут параллельно
// (Promise.all в зондах и гардах), и пока первый запуск не закончился, второй вызов
// видел null и запускал свой браузер. Закрывался только последний — лишний
// держал jest живым после прогона: одиночный запуск файла висел до потолка в
// 10 минут (25.09, spec 115).
let shared: Promise<Browser> | null = null;
function browser(): Promise<Browser> {
  shared ??= chromium.launch();
  return shared;
}

/** Закрыть общий браузер (вызывать в конце прогона/в afterAll). */
export async function closeBrowser(): Promise<void> {
  const b = await shared;
  shared = null;
  await b?.close();
}

function serveOnce(html: string): Promise<{ base: string; server: Server }> {
  const server = createServer((req, res) => {
    if ((req.url ?? "").startsWith("/data/products.json")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      done({ base: `http://127.0.0.1:${port}`, server });
    });
  });
}

/**
 * Поднять окно ВЫШЕ документа. Короткое окно прячет щели раскладки: одна и та
 * же «не до конца» даёт 22px на 1000 и 422px на 1400.
 */
async function growTall(page: Page, width: number, height: number): Promise<number> {
  const need = await page.evaluate(() => document.documentElement.scrollHeight);
  const tall = Math.min(Math.max(height, need + 120), 12000);
  if (tall !== height) await page.setViewportSize({ width, height: tall });
  return tall;
}

/** Открыть сцену. Закрывать обязательно (`stage.close()` или `withStage`). */
export async function openStage(spec: StageSpec): Promise<Stage> {
  const width = spec.width ?? DEFAULT_WIDTH;
  const height = spec.height ?? DEFAULT_HEIGHT;
  const ctx = await (await browser()).newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  // tsx/esbuild оборачивает функции в `__name(...)` (keepNames). Playwright
  // сериализует функцию исходником, и в браузере она падает на
  // «__name is not defined» — зонд выглядит сломанным, хотя сломан транспайлер.
  // Заглушка ставится и на будущие переходы, и на уже открытую страницу.
  await page.addInitScript(SHIM_NAME);
  await page.evaluate(SHIM_NAME).catch(() => {});
  if (spec.storage) {
    await page.addInitScript((pairs: Array<[string, string]>) => {
      for (const [k, v] of pairs) {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* приватный режим — не наша беда */
        }
      }
    }, Object.entries(spec.storage).map(([k, v]) => [k, JSON.stringify(v)] as [string, string]));
  }

  let server: Server | null = null;
  let tokensCss: string | null = null;
  let label: string;

  if (spec.kind === "live") {
    label = spec.url;
    await page.goto(spec.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    tokensCss = sniffTokensCss(await page.content());
  } else {
    const schemes = spec.schemes ?? loadTesterSchemes();
    tokensCss = tokensCssFor(spec.theme, schemes);
    const rendered = spec.blocks.map(({ block, props }) => ({
      block,
      html: renderBlock(spec.theme, block, {
        colorScheme: spec.schemeId == null ? undefined : `scheme-${schemeNum(spec.schemeId)}`,
        ...props,
      }),
    }));
    const html = pageHtml({
      theme: spec.theme,
      blocks: rendered,
      tokensCss,
      schemeId: spec.schemeId,
    });
    const served = await serveOnce(html);
    server = served.server;
    label = `${spec.theme}/${spec.blocks.map((b) => b.block).join("+")}@схема-${spec.schemeId ?? "нет"}`;
    // Внешняя сеть заглушена: замер не должен зависеть от MinIO.
    await page.route("**/*", (route) => {
      const u = route.request().url();
      return /^(data:|about:|blob:)/.test(u) || u.startsWith(served.base)
        ? route.continue()
        : route.abort();
    });
    await page.goto(served.base, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  }

  const declaredHeight = await growTall(page, width, height);

  return {
    page,
    declaredWidth: width,
    declaredHeight,
    label,
    tokensCss,
    close: async () => {
      await ctx.close();
      server?.close();
    },
  };
}

export async function withStage<T>(spec: StageSpec, fn: (stage: Stage) => Promise<T>): Promise<T> {
  const stage = await openStage(spec);
  try {
    return await fn(stage);
  } finally {
    await stage.close();
  }
}

/**
 * Проверка исходника, который уходит в браузер СТРОКОЙ.
 *
 * Симптом: узлы «не находятся», хотя они в DOM. Причина: внутри шаблонной
 * строки `\d` схлопывается в `d`, и `/^-\d+%$/` уезжает в браузер как
 * `/^-d+%$/`. То же с `\s` и `\w`. Лечится либо `[0-9]`, либо `\\d`.
 *
 * Зонды этой библиотеки передают в браузер ФУНКЦИИ, а не строки, — там ловушки
 * нет вовсе. Функция ниже сторожит те места, где строка всё-таки нужна.
 */
export function assertBrowserSource(src: string): string {
  const hit = /(?<![\\[\w])[dsw]\+/.exec(src);
  if (hit) {
    throw new Error(
      `в исходнике для браузера схлопнулось экранирование: «${hit[0]}» на позиции ${hit.index}. ` +
        "Внутри шаблонной строки пишите [0-9] либо \\\\d — иначе регулярка уедет в браузер сломанной.",
    );
  }
  return src;
}

/** Выполнить сырой исходник в браузере с проверкой на схлопнутое экранирование. */
export async function evaluateSource<T>(page: Page, src: string): Promise<T> {
  return page.evaluate(assertBrowserSource(src)) as Promise<T>;
}

export type { Page };
