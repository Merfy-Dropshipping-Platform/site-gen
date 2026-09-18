import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Жалоба владельца 19.09: «цвет скидки должен быть как у текста, а не браться
 * из заголовка», затем «надо ещё также по цветам — сделать для скидки и
 * контролов +/-».
 *
 * Первый заход починил только КОРЗИНУ (сторожит `cart-line-not-heading`).
 * Живой замер витрины после выкатки показал, что в остальных местах старая
 * цена осталась приглушённой, а местами вообще вне схемы: каталоги bloom и
 * satin несли литерал `#999999`, каталог vanilla — `#444444`.
 *
 * Этот сторож требует: ВЕЗДЕ, где рисуется зачёркнутая старая цена, цвет
 * берётся из `--color-text` — не из приглушённого серого, не из заголовка и
 * не литералом.
 *
 * Вне объёма: `ProductVariants` (там `line-through` помечает НЕДОСТУПНЫЙ
 * вариант, а не цену) и чекаут с подтверждением заказа (`CheckoutOrderSummary`,
 * `OrderConfirmation`) — типографика чекаута зафиксирована решением владельца
 * 16.09. Тема `luna` вне объёма по AGENTS.md.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "vanilla", "flux"] as const;

/** Мишени собираем по факту наличия файла — состав карточек по темам разный. */
function candidates(): string[] {
  const out: string[] = [];
  for (const t of THEMES) {
    out.push(`themes/${t}/src/components/sections/WishlistSection.astro`);
    for (const name of [
      "RoseProductCard",
      "BloomProductCard",
      "SatinProductCard",
      "VanillaProductCard",
      "FluxProductCard",
    ]) {
      out.push(`themes/${t}/src/components/products/${name}.astro`);
    }
    out.push(`packages/theme-${t}/blocks/Catalog/Catalog.astro`);
    // ЧЕТВЁРТЫЙ путь рендера — JS-гидрация карточек на витрине. Найден 19.09
    // живым замером ПОСЛЕ выкатки: в bloom-корзине рядом с зачёркиванием
    // остался `--color-muted`, и пришёл он именно отсюда. В `.astro` правка
    // была, в гидрации — нет.
    out.push(`themes/${t}/src/lib/storefront-hydrate.ts`);
    out.push(`packages/theme-${t}/blocks/Catalog/storefront-hydrate.ts`);
    for (const name of [
      "RoseProductCard",
      "BloomProductCard",
      "SatinProductCard",
      "FluxProductCard",
    ]) {
      out.push(`packages/theme-${t}/blocks/Catalog/${name}.astro`);
    }
  }
  out.push("packages/theme-base/blocks/Catalog/Catalog.astro");
  return out;
}

type Target = { rel: string; src: string; lines: string[] };

const targets: Target[] = [];
for (const rel of candidates()) {
  const path = resolve(SITES_ROOT, rel);
  if (!existsSync(path)) continue;
  const src = readFileSync(path, "utf-8");
  // Только строки РАЗМЕТКИ: комментарии тоже упоминают line-through, а
  // сторожить надо класс, а не прозу.
  const lines = src
    .split("\n")
    .filter((l) => l.includes("line-through") && /class=/.test(l));
  if (lines.length === 0) continue;
  targets.push({ rel, src, lines });
}

const BAD = /--color-muted|--color-heading|--vanilla-dark|--vanilla-muted|#999999|#444444/;

describe("старая цена везде следует тексту схемы", () => {
  it("мишени найдены (каталоги, карточки, избранное)", () => {
    // избранное + карточки тем + каталоги пакетов + карточки пакетов +
    // гидрация (4-й путь) + база
    expect(targets.length).toBeGreaterThanOrEqual(22);
  });

  it.each(targets.map((t) => [t.rel, t] as const))(
    "%s: зачёркнутая цена красится --color-text",
    (_rel, t) => {
      for (const line of t.lines) {
        expect(line).toMatch(/--color-text/);
        expect(line).not.toMatch(BAD);
      }
    },
  );
});

describe("саботаж: гард ловит возврат серого и литералов", () => {
  it("приглушённый серый — красный", () => {
    const line = `<span class="text-[rgb(var(--color-muted,153_153_153))] line-through">1 ₽</span>`;
    expect(line).toMatch(BAD);
  });

  it("литерал #999999 — красный", () => {
    const line = `<span class="text-[#999999] line-through">1 ₽</span>`;
    expect(line).toMatch(BAD);
    expect(line).not.toMatch(/--color-text/);
  });

  it("литерал #444444 — красный", () => {
    const line = `<span class="text-[#444444] line-through">1 ₽</span>`;
    expect(line).toMatch(BAD);
  });
});
