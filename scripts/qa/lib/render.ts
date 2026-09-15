/**
 * Живой рендер секции темы — та же лестница, что у витрины
 * (dist/theme-sections/<тема>/manifest.json → пакет темы → theme-base).
 *
 * Модуль намеренно НЕ тянет playwright: им пользуются и браузерные зонды, и
 * обычные jest-гарды, которым браузер не нужен.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { SITES_ROOT, themeCss } from "./tailwind-css";
import { schemeNum } from "./schemes";

const RENDERER = resolve(SITES_ROOT, "src/themes/__tests__/render-theme-sections.mjs");
/** flux/bloom/vanilla резолвят товар HTTP-запросом во фронтматтере. */
const CATALOG_STUB = resolve(SITES_ROOT, "scripts/qa/product-six-images-stub.mjs");

export type RenderJob = {
  block: string;
  props?: Record<string, unknown>;
  catalog?: unknown;
  cascade?: boolean;
  live?: boolean;
  pkg?: string;
};

export type RenderedBlock = { block: string; html?: string; error?: string; missing?: boolean };

/**
 * Живой рендер порта темы — ТА ЖЕ лестница, что у витрины
 * (dist/theme-sections/<тема> → пакет темы → theme-base).
 */
export function renderSections(theme: string, jobs: RenderJob[]): RenderedBlock[] {
  const full = jobs.map((j) => ({ cascade: true, live: true, ...j }));
  const out = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify(full)],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 },
  );
  return JSON.parse(out) as RenderedBlock[];
}

/** Один блок; нет HTML — падаем громко. */
export function renderBlock(
  theme: string,
  block: string,
  props: Record<string, unknown> = {},
  extra: Partial<RenderJob> = {},
): string {
  const row = renderSections(theme, [{ block, props: { id: `${block}-1`, ...props }, ...extra }])[0];
  if (!row?.html) {
    throw new Error(`рендер ${block} (${theme}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`);
  }
  return row.html;
}

/**
 * Страница из отрисованных блоков: CSS темы + tokens.css + обёртка схемы
 * ДОСЛОВНО как в v2-page-composer (есть схема — есть `.color-scheme-N`, нет —
 * обёртки нет вовсе; без обёртки блок не принимает схему НИКОГДА).
 *
 * Фон страницы намеренно ядовитый rgb(1,2,3): прозрачный корень секции виден
 * числом, а не «на глаз».
 */
export function pageHtml(opts: {
  theme: string;
  blocks: Array<{ block: string; html: string }>;
  tokensCss: string;
  schemeId?: string | number | null;
  bodyStyle?: string;
}): string {
  const scheme = opts.schemeId == null ? null : schemeNum(opts.schemeId);
  const body = opts.blocks
    .map(({ block, html }) => {
      const inner = scheme
        ? `<div class="color-scheme-${scheme}" data-block-scheme="${scheme}">${html}</div>`
        : html;
      return `<div data-measure="${block}">${inner}</div>`;
    })
    .join("\n");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>${themeCss(opts.theme)}</style>
<style id="__merfy_tokens_css">${opts.tokensCss}</style>
<style>html,body{margin:0;padding:0;background:${opts.bodyStyle ?? "rgb(1,2,3)"}}</style>
</head><body><main>${body}</main></body></html>`;
}

