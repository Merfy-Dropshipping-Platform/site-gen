import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Жалоба владельца 21.09: «цвета в корзине не поменялись».
 *
 * Замер на его ЖИВОМ магазине (панель открыта, товар в корзине): внутри панели
 * НОЛЬ токенов схемы, всё зашито — заголовок rgb(0,0,0), «Скрыть» и подписи
 * rgb(153,153,153), кнопки белым по чёрному. Панель оставалась чёрным по
 * белому при любой схеме, хотя шапка того же сайта уже была белым по чёрному.
 *
 * Страница корзины и её секция при этом оказались исправны — проверены на том
 * же сайте и с товаром внутри, там ровно один литерал `bg-[#F5F5F5]` (серая
 * плашка под фото, законное исключение). Ломалась именно выдвижная панель.
 *
 * Оригинал панели живёт в опубликованном пакете дизайн-системы и правке не
 * подлежит — та же ситуация, что была с NtIcon. Темы переведены на копию с
 * токенами: `packages/theme-base/primitives/SchemeCartDrawer.astro`.
 *
 * Замер после правки на СОБРАННОЙ витрине rose: 0 зашитых цветов, 11 токенов.
 */
const ROOT = resolve(__dirname, "..", "..", "..");
const DRAWER = resolve(
  ROOT,
  "packages",
  "theme-base",
  "primitives",
  "SchemeCartDrawer.astro",
);

/** Темы и файл, который монтирует панель. */
const MOUNTS: ReadonlyArray<readonly [string, string]> = [
  ["rose", "themes/rose/src/components/StorefrontRuntime.astro"],
  ["bloom", "themes/bloom/src/layouts/Layout.astro"],
  ["flux", "themes/flux/src/layouts/Layout.astro"],
  ["satin", "themes/satin/src/layouts/Layout.astro"],
];

const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("панель корзины: цвета из схемы, а не из литералов", () => {
  const drawer = readFileSync(DRAWER, "utf8");

  it("в панели нет зашитых цветов", () => {
    // bg-black/35 — затемнение позади панели, тень-подложка, а не поверхность
    // схемы: оно остаётся литералом осознанно.
    const source = drawer.replace(/bg-black\/35/g, "");
    const literals = source.match(
      /text-\[#[0-9A-Fa-f]{3,6}\]|bg-\[#[0-9A-Fa-f]{3,6}\]|border-\[#[0-9A-Fa-f]{3,6}\]|\btext-white\b|\btext-black\b|\bbg-white\b|\bbg-black\b/g,
    );
    expect(literals ?? []).toEqual([]);
  });

  it.each([
    ["--color-bg", "полотно панели"],
    ["--color-heading", "заголовок"],
    ["--color-text", "обычный текст"],
    ["--color-muted", "приглушённые подписи"],
    ["--color-button-bg", "фон кнопки"],
    ["--color-button-text", "текст кнопки"],
  ])("используется токен %s (%s)", (token) => {
    expect(drawer).toContain(token);
  });

  it.each(MOUNTS)(
    "%s монтирует панель со схемой, а не из пакета",
    (_theme, file) => {
      const src = read(file);
      expect(src).toContain("primitives/SchemeCartDrawer.astro");
      expect(src).not.toContain(
        "design-systems-theme/components/ui/NtCartDrawer.astro",
      );
    },
  );
});
