import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Жалоба владельца 17.09 (дословно, повторил дважды): «Заголовок, количество,
 * цена в корзине — это в теме Bloom. Плюс не отображается цена без скидки,
 * тоже в корзине.»
 *
 * Замер по мишеням «заголовок/количество/цена» (страница + легаси-монолит +
 * дровер) показал, что все три УЖЕ едут за цветовой схемой (guards
 * cart-page-scheme.spec.ts / cart-drawer-items-scheme.spec.ts /
 * cart-drawer-scheme.spec.ts зелёные на этой ветке — фикс 15-16.09,
 * коммиты 8315a137/8c2e7c32/75895b45). Реальный оставшийся дефект — вторая
 * часть жалобы: старая (зачёркнутая) цена товара со скидкой в принципе не
 * рисуется нигде на bloom, хотя у эталонов (rose/flux) она есть и в
 * CartBody.astro (страница), и в CartSection.astro (легаси-алиас для
 * немигрированных ревизий) — см. `line.oldPrice` + класс `line-through`.
 *
 * Этот сторож проверяет ТОЛЬКО bloom (canon других тем не трогаем) и требует:
 *   1) исходник читает `line.oldPrice` и сравнивает со `line.price`;
 *   2) итоговая разметка несёт класс `line-through` для старой цены;
 *   3) старая цена красится токеном ТЕКСТА схемы (`--color-text`), а не
 *      литералом и не приглушённым серым.
 *
 * ПОПРАВКА 19.09. Пункт 3 требовал `--color-muted` — и тем самым закреплял
 * баг. Жалоба владельца: «цвет скидки должен быть как у текста, а не браться
 * из заголовка». Замер по его скриншоту (схема bg #26311c / заголовок #FA2121
 * / текст #44FF6D) показал, что в дефолтных схемах ВСЕХ пяти тем
 * `--color-heading` равен `--color-text`, поэтому расхождение видно только у
 * мерчанта, задавшего их разными, — ни один стенд его не ловил. Приглушённый
 * серый тоже «не как у текста»: он производный (60 % текста + 40 % фона).
 * Теперь старая цена берёт сам `--color-text`.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");

function bloomSource(relPath: string): string {
  return readFileSync(resolve(SITES_ROOT, "themes", "bloom", relPath), "utf-8");
}

const TARGETS = [
  "src/components/sections/CartBody.astro",
  "src/components/sections/CartSection.astro",
] as const;

describe("bloom: цена без скидки (compareAt/oldPrice) отображается в корзине", () => {
  it.each(TARGETS)("%s читает line.oldPrice и сравнивает с line.price", (rel) => {
    const src = bloomSource(rel);
    expect(src).toMatch(/line\.oldPrice/);
    expect(src).toMatch(/oldPrice[^\n]*>\s*line\.price|line\.price[^\n]*<[^\n]*oldPrice/);
  });

  it.each(TARGETS)("%s рисует старую цену зачёркнутой (line-through)", (rel) => {
    const src = bloomSource(rel);
    expect(src).toMatch(/line-through/);
  });

  it.each(TARGETS)("%s красит старую цену токеном схемы --color-text, не литералом", (rel) => {
    const src = bloomSource(rel);
    // Строка с line-through обязана нести --color-text и не нести #-литерал цвета.
    const lines = src.split("\n").filter((l) => l.includes("line-through"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/--color-text/);
      expect(line).not.toMatch(/--color-heading/);
      expect(line).not.toMatch(/text-\[#[0-9A-Fa-f]{3,8}\]/);
    }
  });
});

describe("саботаж: гард обязан ловить отсутствие старой цены", () => {
  it("исходник без line.oldPrice — красный", () => {
    const src = `
      const totalCurrent = formatCartPrice(line.price * line.quantity);
      return \`<span>\${totalCurrent}</span>\`;
    `;
    expect(src).not.toMatch(/line\.oldPrice/);
  });

  it("line-through литералом (не токеном) — красный", () => {
    const src = `<span class="text-[#999999] line-through">100 ₽</span>`;
    expect(src.includes("--color-text")).toBe(false);
  });

  it("line-through цветом заголовка — красный", () => {
    const src = `<span class="text-[rgb(var(--color-heading,0_0_0))] line-through">100 ₽</span>`;
    expect(src).toMatch(/--color-heading/);
    expect(src).not.toMatch(/--color-text/);
  });
});
