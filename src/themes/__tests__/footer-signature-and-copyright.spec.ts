import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Подвал: копирайт ушёл из тем, подпись платформы стала ссылкой.
 *
 * Владелец 20.09, два сообщения подряд:
 *
 *   1. «© 2026 MrMerfy Все права защищены. берётся неверно… данная информация
 *      идёт только из блока информации, если заполнено, а не от темы» —
 *      собранный ТЕМОЙ копирайт удалить во всех пяти темах. То, что мерчант
 *      завёл сам в «Блоках информации о компании», и так выводится в колонке
 *      контактов (`contactFields`), отдельной сборки для него не нужно.
 *
 *   2. «Сделать именно ссылкой на https://merfy.ru/ Разработано на Merfy» —
 *      стандартная подпись платформы кликабельна. Сначала он сказал «не должно
 *      быть ссылкой вообще», потом поправил сам себя скриншотом; действует
 *      второе. Как только мерчант впишет своё в «Содержимое темы» — ссылка
 *      снимается и остаётся просто текст (это в том же скриншоте).
 *
 * ПОЧЕМУ ГАРД ЧИТАЕТ ИСХОДНИК БЕЗ КОММЕНТАРИЕВ. Первая же проверка «нет ли
 * литерала в файле» дала 5 ложных срабатываний: в каждой теме над сборкой
 * копирайта стоит комментарий, цитирующий вёрстку («© {год} {siteTitle} Все
 * права защищены»). Считать такой комментарий возвратом бага нельзя, а просто
 * искать литерал — значит сторожить текст комментария. Поэтому строки,
 * начинающиеся с `//`, и блоки `<!-- -->` / `{/* *\/}` срезаются, и проверка
 * идёт по коду, который реально рендерится.
 *
 * ЖИВОЙ ИСТОЧНИК — themes/<тема>/src/components/Footer.astro, а НЕ
 * packages/theme-base/blocks/Footer: реестры тем объявляют
 * `../components/Footer.astro`, а ассемблер кладёт туда порт темы. Проверено
 * сборкой: dist/theme-sections/<тема>/themes_<тема>_src_components_Footer_astro.mjs.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const SIGNATURE = "Разработано на Merfy";
const PLATFORM_URL = "https://merfy.ru/";
const COPYRIGHT_TAIL = "Все права защищены";

/** Темы, где полоса подписи и строка копирайта — РАЗНЫЕ узлы. */
const SPLIT_THEMES = ["bloom", "satin", "vanilla"] as const;
/** Темы, где носитель один: чёрная копирайт-полоса (отдельной полосы нет). */
const SINGLE_NODE_THEMES = ["rose", "flux"] as const;

function footerSource(theme: string): string {
  return readFileSync(
    resolve(SITES_ROOT, "themes", theme, "src/components/Footer.astro"),
    "utf-8",
  );
}

/**
 * Срезает комментарии: `//`-строки, `<!-- -->` и `{/* *\/}`.
 *
 * Порядок важен. Сначала убираются СТРОЧНЫЕ комментарии, и только потом
 * блочные: у rose в строчном комментарии стоит путь `/legal/*`, и блочное
 * правило, применённое первым, съедало всё от него до ближайшего `*\/`
 * двумястами строками ниже — вместе со сборкой подписи. Гард при этом
 * краснел на rose и молчал бы, если бы литерал прятался в этом же куске.
 */
function stripComments(src: string): string {
  const withoutLineComments = src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
  return withoutLineComments
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

describe("подвал: копирайт убран из тем, подпись платформы — ссылка", () => {
  it.each(THEMES)("%s: тема больше не собирает копирайт сама", (theme) => {
    const code = stripComments(footerSource(theme));
    // Калибровка: в исходнике литерал ЕСТЬ (в комментарии-цитате вёрстки) —
    // значит срезание комментариев работает, а не проверка сторожит пустоту.
    if (theme !== "vanilla") {
      expect(footerSource(theme)).toContain(COPYRIGHT_TAIL);
    }
    expect(code).not.toContain(COPYRIGHT_TAIL);
  });

  it.each(THEMES)("%s: подпись по умолчанию — «Разработано на Merfy»", (theme) => {
    const code = stripComments(footerSource(theme));
    expect(code).toContain(SIGNATURE);
  });

  it.each(THEMES)("%s: стандартная подпись ведёт на %s", (theme) => {
    const code = stripComments(footerSource(theme));
    expect(code).toMatch(
      new RegExp(`const PLATFORM_URL\\s*=\\s*["']${PLATFORM_URL.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}["']`),
    );
    // Признак «это дефолт» и ссылка, навешенная именно по нему.
    expect(code).toMatch(/const stripIsDefault\s*=\s*stripText\s*===\s*["']Разработано на Merfy["']/);
    expect(code).toMatch(/stripIsDefault\s*\?\s*\(?\s*<a href=\{PLATFORM_URL\}/);
    expect(code).toMatch(/rel="noopener noreferrer"/);
  });

  it.each(THEMES)("%s: мерчантский текст подписи идёт без ссылки", (theme) => {
    const code = stripComments(footerSource(theme));
    // Вторая ветка тернарника — голый stripText, без обёртки <a>.
    const m = code.match(/stripIsDefault \? \([\s\S]{0,400}?\) : \(\s*([\s\S]{0,60}?)\s*\)/);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("stripText");
  });

  it.each(SPLIT_THEMES)("%s: строка копирайта пуста, пока мерчант её не задал", (theme) => {
    const code = stripComments(footerSource(theme));
    expect(code).toMatch(/const copyrightText\s*=\s*copyrightOverride \?\? "";/);
    // И пустую строку не рисуем узлом — иначе в подвале висит пустой абзац
    // (у bloom — ещё и линейка без текста).
    expect(code).toMatch(/const showCopyright\s*=\s*copyrightText\.trim\(\)\.length\s*>\s*0;/);
    expect(code).toContain("showCopyright &&");
  });

  it.each(SINGLE_NODE_THEMES)("%s: на единственном узле остаётся подпись", (theme) => {
    const code = stripComments(footerSource(theme));
    expect(code).toMatch(/const copyrightText\s*=\s*\n?\s*copyrightOverride \?\?\s*\n?\s*poweredBy;/);
  });
});

describe("подвал: собранный модуль темы без копирайта", () => {
  // В CI артефакт satin-dist несёт секции ТОЛЬКО satin (`build:theme-sections
  // satin`), локально — все пять. Поэтому проверяем те, что собраны, и
  // отдельно требуем, чтобы проверен был хотя бы один: иначе блок молча
  // выродится в ноль проверок и будет зелёным ни о чём.
  const built = THEMES.map((theme) => ({
    theme,
    file: resolve(
      SITES_ROOT,
      "dist/theme-sections",
      theme,
      `themes_${theme}_src_components_Footer_astro.mjs`,
    ),
  })).filter(({ file }) => existsSync(file));

  it("хотя бы один собранный подвал доступен для проверки", () => {
    expect(built.length).toBeGreaterThan(0);
  });

  it("в собранных подвалах нет копирайта и есть ссылка на платформу", () => {
    for (const { theme, file } of built) {
      const code = stripComments(readFileSync(file, "utf-8"));
      expect(`${theme}: ${code.includes(COPYRIGHT_TAIL)}`).toBe(`${theme}: false`);
      expect(`${theme}: ${code.includes(PLATFORM_URL)}`).toBe(`${theme}: true`);
      expect(`${theme}: ${code.includes(SIGNATURE)}`).toBe(`${theme}: true`);
    }
  });
});
