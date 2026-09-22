import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Сторож п.7 брифа `merfy-mcp/docs/plans/2026-09-23-vanilla-seed-into-package.md`:
 * «в `revision-migrations.ts` не появляется новых `if (themeId === '…')` —
 * тема — это данные её пакета `packages/theme-<t>`, а не код в общем пути
 * чтения ревизии».
 *
 * Что ловим: литеральные ветвления ПО ИМЕНИ темы — `themeId === 'vanilla'`,
 * `themeId !== 'bloom'`, `Set(['rose', ...])` и т.п. — там, где решение
 * ДОЛЖНО приниматься по манифесту темы (`getThemeManifest(themeId)`), а не
 * по строковому литералу.
 *
 * Что НЕ ловим (и почему): комментарии (могут упоминать имена тем как
 * документацию) и белый список ниже — то, что осталось осознанно, вне
 * периметра этого брифа, с указанной причиной. Если список нужно расширить —
 * это должно быть решение агента с записью причины, а не молчаливый рост.
 */

const FILE = resolve(__dirname, "../revision-migrations.ts");
const THEME_NAMES = ["vanilla", "bloom", "rose", "flux", "satin"] as const;

/** Снимает `/* … *\/` и `// …` комментарии — грубо, но для grep-сторожа хватает
 * (в файле нет строк с `//` или `/ *` внутри строковых литералов кода). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Белый список литералов имени темы, которые осознанно остаются в коде вне
 * периметра этого брифа. Каждая запись — точная подстрока кода + причина.
 * Сторож вычитает эти вхождения из общего счёта ПЕРЕД тем, как требовать 0.
 */
const WHITELIST: Array<{ needle: string; reason: string }> = [
  {
    needle: "const CART_THEME_SCHEME_THEMES = new Set(['bloom']);",
    reason:
      "dropSeededCartScheme (b*: cart-scheme) — отдельная, более ранняя задача " +
      "(схема корзины из theme.json.blockDefaults для тем, где она задана). " +
      "Не входит в периметр брифа 2026-09-23-vanilla-seed-into-package.md " +
      "(vanilla home seed / bloom header padding / checkout-result), поэтому не трогается.",
  },
];

describe("revision-migrations.ts не содержит литеральных if(themeId === на конкретную тему)", () => {
  const rawSource = readFileSync(FILE, "utf-8");
  const codeOnly = stripComments(rawSource);

  it("файл существует и непустой (страховка от опечатки в пути)", () => {
    expect(rawSource.length).toBeGreaterThan(1000);
  });

  it('нет if(themeId === "<тема>") / if(themeId !== "<тема>") ни для одной темы', () => {
    for (const theme of THEME_NAMES) {
      const eq = new RegExp(`themeId\\s*===\\s*['"]${theme}['"]`);
      const neq = new RegExp(`themeId\\s*!==\\s*['"]${theme}['"]`);
      expect({ theme, eq: eq.test(codeOnly), neq: neq.test(codeOnly) }).toEqual(
        {
          theme,
          eq: false,
          neq: false,
        },
      );
    }
  });

  it("удалённые миграции (vanilla home seed, bloom header padding) не возвращались", () => {
    expect(codeOnly).not.toMatch(/migrateVanillaHomePage/);
    expect(codeOnly).not.toMatch(/migrateBloomHeaderPadding/);
    expect(codeOnly).not.toMatch(/VANILLA_HOME_MIGRATION_VERSION/);
    expect(codeOnly).not.toMatch(/VANILLA_CATALOG_DEFAULTS/);
  });

  it("checkout-result сеется по манифесту темы, а не по literal themeId", () => {
    // Раньше: `themeId === 'rose' || themeId === 'flux' ? seedCheckoutResultPage(out) : out`.
    expect(codeOnly).toMatch(/themeHasCheckoutResultPage\(themeId\)/);
    expect(codeOnly).not.toMatch(
      /themeId\s*===\s*['"]rose['"]\s*\|\|\s*themeId\s*===\s*['"]flux['"]/,
    );
  });

  it("все остальные литералы имени темы в коде — из белого списка с причиной", () => {
    let remaining = codeOnly;
    for (const { needle } of WHITELIST) {
      // Вычитаем ИМЕННО вхождения из белого списка (каждое — по одному разу).
      remaining = remaining.replace(needle, "");
    }
    const leftoverHits: Array<{ theme: string; count: number }> = [];
    for (const theme of THEME_NAMES) {
      const re = new RegExp(`['"]${theme}['"]`, "g");
      const count = (remaining.match(re) ?? []).length;
      if (count > 0) leftoverHits.push({ theme, count });
    }
    expect(leftoverHits).toEqual([]);
  });
});
