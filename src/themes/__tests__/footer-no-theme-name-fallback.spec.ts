/**
 * Подвал ни одной темы не подставляет собственное имя темы.
 *
 * Владелец 18.09: «в подвал должна идти лого из настроек темы, если загружена,
 * или, если нет, то как в шапке браться с админки, а не отображаться название
 * темы».
 *
 * ЧЕТЫРЕ ИСТОЧНИКА, найденные по одному (каждый раз замером живого стенда, а не
 * чтением кода — на чтении казалось, что всё уже сделано):
 *   1. сиды тем `packages/theme-<bloom|flux|satin>/pages/home.json` —
 *      `copyright.companyName` = имя темы. Вычищено;
 *   2. `copyright.companyName` в РЕВИЗИЯХ уже созданных сайтов — правка сидов
 *      их не достаёт. Вычищено миграцией;
 *   3. `siteTitle` в ревизии: замер стенда satin показал «SATIN» при магазине
 *      «Satin Demo» — поле другое, чистка первого не помогла. Вычищено той же
 *      миграцией, с подстановкой названия магазина;
 *   4. САМ ПОРТ ТЕМЫ: `themes/<тема>/src/components/Footer.astro` подставлял
 *      `SITE_TITLE` из `consts.ts`, когда проп пуст. Замер bloom: подвал
 *      печатал «Bloom» при магазине «Bloom Pilot», хотя в ревизии обоих полей
 *      уже не было. Этот тест сторожит именно четвёртый путь.
 *
 * Запасное значение теперь нейтральное. Название магазина подставляют сборка
 * (`build.service`) и миграция ревизии — им оно известно, порту нет.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const footerSource = (theme: string): string =>
  readFileSync(resolve(ROOT, `themes/${theme}/src/components/Footer.astro`), "utf-8");

describe("подвал темы не подставляет имя темы", () => {
  it.each(THEMES)("%s: запасное имя магазина — не SITE_TITLE", (theme) => {
    const src = footerSource(theme);
    const line = src
      .split("\n")
      .find((l) => l.includes("const siteTitle") && l.includes("p.siteTitle"));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/:\s*SITE_TITLE/);
    expect(line).toMatch(/"Мой магазин"/);
  });

  it.each(THEMES)("%s: имя темы не зашито в подвал литералом", (theme) => {
    const src = footerSource(theme).replace(/\/\/.*$/gm, "");
    const name = theme[0].toUpperCase() + theme.slice(1);
    // Литерал «Bloom» / «Satin» и т.д. в подвале — ровно тот баг.
    expect(src).not.toMatch(new RegExp(`["'\`]${name}["'\`]`));
  });

  it("САБОТАЖ-ОПОРА: сами файлы подвалов на месте и содержат разбор пропа", () => {
    // Без этой опоры две проверки выше зеленели бы даже на пустом файле.
    for (const theme of THEMES) {
      expect(footerSource(theme)).toContain("p.siteTitle");
    }
  });
});
