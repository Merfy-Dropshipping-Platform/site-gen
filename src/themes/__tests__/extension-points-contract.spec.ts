/**
 * PR-19 «Три точки расширений на витрине» — контрактный гард.
 *
 * Проверяет ФАКТ подключения рантайма (без DOM — поведение уже покрыто
 * `packages/theme-base/__tests__/extension-points.dom.test.ts`):
 *   1) три точки монтирования есть РОВНО в тех трёх theme-base блоках,
 *      что назначены планом (CartTotals/CheckoutTotals/AccountLayout);
 *   2) ни один из пяти «портов» темы (`packages/theme-<t>`) не несёт свою
 *      копию рантайма — единственный источник, как и у остальных runtime/*;
 *   3) пять legacy-страниц кабинета (`themes/<t>/src/pages/account/index.astro`)
 *      несут ОДНУ И ТУ ЖЕ строку монтирования (byte-identical);
 *   4) CheckoutTotals/CheckoutSubmit слушают checkout:extension-discount-changed.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SITES_ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), "utf8");

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", ".astro"]);

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      files.push(...collectFiles(full));
      continue;
    }
    if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".astro"))
    ) {
      files.push(full);
    }
  }
  return files;
}

describe("extension-points — три точки монтирования (theme-base)", () => {
  const cases: Array<{ block: string; path: string; point: string }> = [
    {
      block: "CartTotals",
      path: "packages/theme-base/blocks/CartTotals/CartTotals.astro",
      point: "cart",
    },
    {
      block: "CheckoutTotals",
      path: "packages/theme-base/blocks/CheckoutTotals/CheckoutTotals.astro",
      point: "checkout",
    },
    {
      block: "AccountLayout",
      path: "packages/theme-base/blocks/AccountLayout/AccountLayout.astro",
      point: "account",
    },
  ];

  it.each(cases)(
    '$block несёт data-ext-point="$point" и вызывает mountExtensionPoint',
    ({ path, point }) => {
      const src = read(path);
      expect(src).toContain(`data-ext-point="${point}"`);
      expect(src).toMatch(/EXTENSION_POINTS_RUNTIME_SOURCE/);
      expect(src).toMatch(/window\.mountExtensionPoint\(/);
      // set:html {SOURCE} — тот самый приём, что у CHECKOUT_BUTTON_CONTRAST_SOURCE
      // (is:inline import на витрине даёт 404 — см. комментарий в runtime).
      expect(src).toMatch(/set:html=\{EXTENSION_POINTS_RUNTIME_SOURCE\}/);
    },
  );

  it("CheckoutSubmit НЕ несёт свою точку монтирования (только читает событие скидки)", () => {
    const src = read(
      "packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.astro",
    );
    expect(src).not.toMatch(/data-ext-point=/);
    expect(src).toMatch(/checkout:extension-discount-changed/);
  });

  it("CheckoutTotals слушает checkout:extension-discount-changed и вычитает его из итога", () => {
    const src = read(
      "packages/theme-base/blocks/CheckoutTotals/CheckoutTotals.astro",
    );
    expect(src).toMatch(/checkout:extension-discount-changed/);
    expect(src).toMatch(/extensionDiscountCents/);
  });

  it("total.ts (CheckoutSubmit) принимает extensionDiscountCents отдельным параметром", () => {
    const src = read("packages/theme-base/blocks/CheckoutSubmit/total.ts");
    expect(src).toMatch(/extensionDiscountCents/);
  });
});

describe("extension-points — единственный источник рантайма (без копий в портах тем)", () => {
  it("runtime/extension-points.ts существует РОВНО один раз, в theme-base", () => {
    const path = join(
      SITES_ROOT,
      "packages/theme-base/runtime/extension-points.ts",
    );
    expect(existsSync(path)).toBe(true);
  });

  it.each(THEMES)(
    "packages/theme-%s не содержит своей копии extension-points / mountExtensionPoint",
    (theme) => {
      const portRoot = join(SITES_ROOT, "packages", `theme-${theme}`);
      if (!existsSync(portRoot)) return; // порт может не существовать целиком — не наш случай
      const offenders = collectFiles(portRoot).filter((f) => {
        const content = readFileSync(f, "utf8");
        return (
          /function mountExtensionPoint\s*\(/.test(content) ||
          /extension-points['"]/.test(content)
        );
      });
      expect(offenders).toEqual([]);
    },
  );
});

describe("extension-points — legacy кабинет (themes/<t>/src/pages/account/index.astro)", () => {
  // AccountLayout (theme-base) сегодня не подключён ни к одной странице
  // (не в одном packages/theme-<t>/pages/*.json) — реальная разметка кабинета
  // сегодня эти пять legacy-страниц. Задание: «если AccountLayout не
  // участвует — добавь ОДНУ одинаковую строку монтирования во все пять тем».
  //
  // Файлы пяти тем совпадают целиком, КРОМЕ одной pre-existing строки
  // (`<Layout … promo={false}>` — rose/flux против vanilla/satin/bloom, не
  // связано с PR-19) — поэтому сравниваем построчно, игнорируя её, а не файл
  // целиком.
  const contents = THEMES.map((t) =>
    read(`themes/${t}/src/pages/account/index.astro`),
  );
  const normalize = (src: string) =>
    src
      .split("\n")
      .filter((line) => !line.includes("<Layout title="))
      .join("\n");

  it("все пять страниц несут ОДИНАКОВУЮ точку монтирования (одна и та же строка/скрипт)", () => {
    const [first, ...rest] = contents.map(normalize);
    rest.forEach((c) => expect(c).toBe(first));
  });

  it('страница напрямую импортирует mountExtensionPoint из packages/theme-base/runtime и вызывает его с point: "account"', () => {
    contents.forEach((src) => {
      expect(src).toContain(
        "import { mountExtensionPoint } from '../../../../../packages/theme-base/runtime/extension-points';",
      );
      expect(src).toMatch(/mountExtensionPoint\(el,\s*\{\s*point:\s*'account'/);
      expect(src).toContain('data-ext-point="account"');
    });
  });
});
