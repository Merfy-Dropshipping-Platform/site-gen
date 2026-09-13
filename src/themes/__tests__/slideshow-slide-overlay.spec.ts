/**
 * «Затемнение» у слайда обязано доезжать до витрины — ПОСЛАЙДНО, во всех пяти
 * темах.
 *
 * Зачем отдельно от проверки состава панели. Вернуть контрол в сайдбар мало:
 * панель может показывать ползунок, который ничего не меняет, — ровно такие
 * «мёртвые настройки» и ловит тестировщик. Здесь секция рендерится ТЕМ ЖЕ
 * скомпилированным модулем, что уходит на витрину и в превью
 * (dist/theme-sections/<тема>/manifest.json), через живую цепочку
 * adaptLegacyProps → blockDefaults → resolveBlockProps.
 *
 * Что считаем. Два слайда в одной секции с РАЗНЫМ затемнением: первый 40,
 * второй 0. В разметке обязан появиться ровно один слой с opacity 0.4 —
 * «послайдно» значит, что второй слайд затемнения не получает. Контрольных
 * прогона два: без значений вовсе (тема рисует свой фолбэк — см.
 * NO_VALUE_LAYERS) и с нулём у всех слайдов (слоёв нет ни одного). Без них
 * проверка была бы зелёной и при намертво вшитом затемнении.
 *
 * Оговорка про vanilla: её полотно — ОДИН копи-блок, скрипт подменяет фоны,
 * поэтому слой затемнения там один на секцию и берётся с ПЕРВОГО слайда
 * (Slideshow.astro: `s0.overlay ?? p.overlay`). Это не «послайдности нет», а
 * другая композиция секции; ползунок слайда на витрину доезжает так же.
 *
 * Почему не grep по исходнику порта: файл может упоминать overlay и при этом
 * читать его из секции, а не из слайда, — так и было до b11d0487.
 *
 * Требует сборки: pnpm build && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Затемнение первого слайда. 40 → opacity:0.4 — ни с чем не спутать. */
const OVERLAY = 40;

/**
 * Что тема рисует, когда затемнения НЕ задано нигде. Четыре темы не рисуют
 * ничего; vanilla — рисует, и это осознанно: её Slideshow.astro повторяет
 * баннер верстальщика (`bg-black/25`), а отсутствие значения там означает «как
 * у верстальщика», ноль — «снять слой». Та же оговорка уже зафиксирована для
 * `Hero.overlay` в panel-field-defaults. Если бы проверка ждала пустоту везде,
 * её пришлось бы «чинить» правкой витрины vanilla — то есть менять вид
 * магазина ради теста.
 */
const NO_VALUE_LAYERS: Record<Theme, string[]> = {
  rose: [],
  bloom: [],
  satin: [],
  flux: [],
  vanilla: ["opacity:0.25"],
};

type Row = { block: string; html?: string; error?: string };

function slide(n: number, overlay?: number): Record<string, unknown> {
  const s: Record<string, unknown> = {
    id: `slide-${n}`,
    // Картинка обязательна: часть портов (rose/flux/bloom) вешает слой
    // затемнения только поверх изображения слайда.
    image: `https://cdn.example.test/slide-${n}.jpg`,
    heading: { text: `MKSLIDE${n}`, size: "medium" },
  };
  if (overlay !== undefined) s.overlay = overlay;
  return s;
}

function render(theme: Theme, slides: Array<Record<string, unknown>>): Row {
  const jobs = [
    {
      block: "Slideshow",
      live: true,
      props: { colorScheme: "1", padding: { top: 40, bottom: 40 }, slides },
    },
  ];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return (JSON.parse(raw) as Row[])[0];
}

/** Слои затемнения: чёрная плашка с инлайновой прозрачностью. */
function overlayLayers(html: string): string[] {
  return html.match(/opacity:\s*0?\.\d+/g) ?? [];
}

function themeSectionsBuilt(theme: Theme): boolean {
  return existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );
}

describe.each(THEMES)(
  "«Затемнение» слайда доезжает до витрины — %s",
  (theme) => {
    it("порты секций собраны (pnpm build:theme-sections:all)", () => {
      // Без сборки рендер бы падал, а «пропущено» выглядело бы как «зелено».
      expect(themeSectionsBuilt(theme)).toBe(true);
    });

    it("значение слайда рисует слой затемнения", () => {
      if (!themeSectionsBuilt(theme)) return;
      const row = render(theme, [slide(1, OVERLAY), slide(2, 0)]);
      expect(row.error).toBeUndefined();
      // Ровно один слой: второй слайд с 0 затемнения не получает.
      expect(overlayLayers(row.html ?? "")).toEqual(["opacity:0.4"]);
    });

    it("без значения тема рисует свой фолбэк, а не значение слайда (контроль)", () => {
      if (!themeSectionsBuilt(theme)) return;
      const row = render(theme, [slide(1), slide(2)]);
      expect(row.error).toBeUndefined();
      // Контроль обязателен: без него проверка выше была бы зелёной и при
      // намертво вшитом затемнении.
      expect(overlayLayers(row.html ?? "")).toEqual(NO_VALUE_LAYERS[theme]);
    });

    it("ноль снимает затемнение даже там, где у темы есть свой фолбэк", () => {
      if (!themeSectionsBuilt(theme)) return;
      const row = render(theme, [slide(1, 0), slide(2, 0)]);
      expect(row.error).toBeUndefined();
      expect(overlayLayers(row.html ?? "")).toEqual([]);
    });
  },
);
