/**
 * «Страница» (Page, packages/theme-base/blocks/Page): собственный класс
 * секции обязан нести `color-scheme-N` независимо от ТИПА пропа `colorScheme`.
 *
 * Баг-репорт [28,42] (bloom/satin): «секция „Страница" при создании в
 * меню — не применяется цветовая схема». Замер лестницей рендера порта
 * (qa:probe scheme, схемы 1↔2, роли --color-bg/--color-heading/--color-text)
 * показал, что ВИДИМЫЙ цвет секции СЕЙЧАС едет за схемой во всех пяти темах
 * (Page не имеет пер-темного порта — один файл на все пять): 209,77,77 →
 * 255,255,255 (фон), 255,255,255 → 0,0,0 (заголовок и текст). Причина —
 * `composeV2Page`/`PreviewService.resolveBlockScheme` оборачивают секцию в
 * `<div class="color-scheme-N">` СНАРУЖИ, читая СЫРОЙ `props.colorScheme`
 * ревизии (`schemeIdFromProp` понимает и `"scheme-1"`, и `1`), и `--color-bg`
 * / `--color-text` / `--color-heading` — обычные НАСЛЕДУЕМЫЕ custom
 * properties: секция получает их от обёртки, даже если своего правила нет.
 *
 * Но у самой секции (её СОБСТВЕННОГО класса на корневом `<section>`) есть
 * независимый механизм — `schemeClass` в Page.astro, который проверяет
 * `typeof colorScheme === 'string'`. Платформенная конвенция нормализации
 * (`adaptLegacyProps`, src/themes/page-blocks.ts) переводит `colorScheme`
 * ЛЮБОГО блока из строки `"scheme-N"` В ЧИСЛО `N` ДО рендера — ровно то, что
 * проходит через ЖИВУЮ цепочку (render-theme-sections.mjs, job.live===true,
 * та же, что PreviewService.renderBlock). Проверка `typeof === 'string'` на
 * числе — false, `schemeClass` пуст, СОБСТВЕННЫЙ класс секции схему не
 * несёт. Сейчас это замаскировано внешней обёрткой (наследование), но:
 *   1. расходится с конвенцией платформы — соседний `AccountSection.astro`
 *      (themes/rose/…): `` `color-scheme-${String(colorScheme ?? 2).replace(...)}` ``
 *      — работает с ЛЮБЫМ типом;
 *   2. `varShadowedInMarkup`/`declaredVar` (section-scheme-targets) и любой
 *      будущий гард, читающий класс САМОЙ секции, а не обёртки, ловил бы
 *      мишень «замерла» ложно.
 *
 * Гард держит факт напрямую: рендерим ЖИВОЙ цепочкой (cascade+live, как
 * витрина) с `colorScheme` ЧИСЛОМ — ровно то, что реально долетает до
 * Astro.props после adaptLegacyProps — и проверяем класс КОРНЯ секции.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
type Theme = (typeof THEMES)[number];

const built = (theme: string) =>
  existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));

function renderPageLive(theme: Theme, props: Record<string, unknown>): string {
  const jobs = [
    { block: "Page", props: { id: "Page-1", ...props }, cascade: true, live: true },
  ];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as { html?: string; error?: string; missing?: boolean }[])[0];
  if (row.html === undefined) {
    throw new Error(`рендер «Страница» (${theme}) не дал HTML: ${JSON.stringify(row)}`);
  }
  return row.html;
}

const rootClassOf = (html: string): string => {
  const tag = /<section[^>]*data-puck-component-id="Page-1"[^>]*>/i.exec(html)?.[0];
  if (!tag) throw new Error(`корень секции не найден: ${html.slice(0, 300)}`);
  return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
};

describe("Page: собственный класс секции несёт color-scheme-N при ЛЮБОМ типе пропа", () => {
  it.each(THEMES)("%s — сборка секций есть", (theme) => {
    expect(built(theme)).toBe(true);
  });

  describe.each(THEMES)("%s", (theme: Theme) => {
    it("colorScheme ЧИСЛОМ (ровно то, что даёт adaptLegacyProps живой цепочке)", () => {
      const cls = rootClassOf(renderPageLive(theme, { colorScheme: 2, padding: { top: 0, bottom: 0 } }));
      expect(cls).toMatch(/\bcolor-scheme-2\b/);
    });

    it("colorScheme СТРОКОЙ 'scheme-N' (сырой Puck-дефолт до нормализации)", () => {
      const cls = rootClassOf(renderPageLive(theme, { colorScheme: "scheme-3", padding: { top: 0, bottom: 0 } }));
      expect(cls).toMatch(/\bcolor-scheme-3\b/);
    });
  });
});
