import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Дефолт «Текста» подписки в ПАНЕЛИ и на ВИТРИНЕ — один и тот же.
 *
 * Баг тестера 18.09: «Vanilla + Bloom: „Подписка на рассылку“ → поле „Текст“.
 * В Bloom расходятся ДАЖЕ БЕЗ ПРАВОК: в панели „Узнавай о новинках и акциях
 * первым“, на витрине „Узнавайте первыми о новых коллекциях…“».
 *
 * Причина: порты всех пяти тем сознательно заменили текст верстальщика на
 * дословный плейсхолдер Figma 1:19335, а `defaults.description` в панели
 * остался прежним. Мерчант видел одно, покупатель — другое.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const PANEL = resolve(
  SITES_ROOT,
  "packages/theme-base/blocks/Newsletter/Newsletter.puckConfig.ts",
);

/** Литерал, на который порт падает при пустых данных. */
function portFallback(theme: string): string | null {
  const src = readFileSync(
    resolve(SITES_ROOT, "themes", theme, "src/components/sections/Newsletter.astro"),
    "utf-8",
  );
  // Комментарии цитируют тот же текст — берём только строковый литерал в коде.
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const m = code.match(/"(Узнавай[^"]*)"/);
  return m ? m[1] : null;
}

function panelDefault(): string | null {
  const code = readFileSync(PANEL, "utf-8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  const m = code.match(/description:\s*'([^']*)'/);
  return m ? m[1] : null;
}

describe("дефолт текста подписки: панель = витрина", () => {
  it("панель объявляет дефолт", () => {
    // Калибровка: без неё сравнение ниже проходило бы на двух null.
    expect(panelDefault()).toBeTruthy();
  });

  it.each(THEMES)("%s: порт падает на тот же литерал, что и панель", (theme) => {
    const порт = portFallback(theme);
    expect({ theme, есть: Boolean(порт) }).toEqual({ theme, есть: true });
    expect({ theme, текст: порт }).toEqual({ theme, текст: panelDefault() });
  });
});
