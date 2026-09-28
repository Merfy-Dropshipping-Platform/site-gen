/**
 * Бейдж карточки/товара (скидка «-N%»/«Скидка», «Новинка») красится ролью
 * СХЕМЫ «Кнопка» — фон `--color-button-bg`, текст `--color-button-text`, той
 * же схемы, что и секция-контейнер (`.color-scheme-N`) — а не своим цветом.
 *
 * Требование владельца 28.09 (скрин: карточка flux, бейдж «-17%» оранжевый
 * #FA5109/белый текст, вне схемы). История (`git log -S`, БАГ = ИСТОРИЯ
 * СНАЧАЛА): это НЕ осознанный токен `--color-sale` — designer-порт вёрстки
 * верстальщика (7d086c2a «раскатка родного каталога», c58b4922 rose), где
 * бейдж достался хардкодом (flux bg #FA5109, satin bg #000000, оба
 * text-white) либо неверной ролью схемы «Акцент» (rose/bloom
 * `--color-accent` + принудительный `!text-white`, роль «Кнопка» не тронута).
 * Отдельная «цветовая настройка бейджа» в конструкторе/theme.json не найдена
 * (badge-поле Product.puckConfig — legacy ТЕКСТ секции, не цвет) — ломать
 * нечего.
 *
 * МЕХАНИЗМ. Класс `.merfy-badge` (packages/theme-base/styles/base.css)
 * вместо Tailwind `bg-[...]/text-[...]` в порте: живая сборка CSS витрины НЕ
 * сканирует `packages/theme-<t>/blocks/**` (только узкие `@source`-строки в
 * `themes/<t>/src/styles/global.css` — reference_live_css_skips_port_blocks,
 * пример-сторож `live-load-more-classes.spec.ts`) — произвольный класс,
 * объявленный только в порте, был бы мёртв на витрине. `base.css` темы
 * подключают через `@import` (не `@source`) — правило доезжает всегда, без
 * Tailwind-скана. Класс, а не `[data-атрибут]`: `scripts/check-css-layers.mjs`
 * форсит атрибут-селекторы base.css/global.css в `@layer base` (там утилита
 * `bg-[...]` победила бы); класс остаётся unlayered.
 *
 * ОХВАТ (карточка каталога/коллекции — 4 темы: rose, bloom, satin, flux;
 * vanilla бейджа на карточке не рисует вовсе — красить нечего, не в объёме).
 * Каждый порт несёт бейдж в ДВУХ местах: SSG-компонент (.astro, рисует
 * первую загрузку страницы) И клиентский `render*Html`-миррор (перерисовывает
 * карточки после фильтра/сортировки/пагинации, живёт в самом Catalog.astro
 * или в соседнем storefront-hydrate.ts) — оба обязаны совпадать, иначе после
 * фильтра бейдж откатится на старый цвет. Плюс legacy-копии
 * (`themes/<t>/src/...`) — их же Tailwind живой сборки сканирует
 * (`@source "../components/**"` / `"../lib/**"`); мёртвый хардкод там не
 * рендерится, но остаётся в CSS витрины и вводит в заблуждение. Плюс страница
 * товара (PDP) — общий для всех 5 тем `ProductGallery.astro` (theme-base),
 * роль там ДО правки была третья, своя: `--color-text`/`--color-bg`
 * (инверсия текста страницы), тоже не «Кнопка».
 *
 * Проверка «без хардкода» — ТОЧНЫЕ старые подстроки (не общий шаблон вроде
 * `--color-accent`, который легитимно встречается в ProductGallery.astro для
 * ДРУГОГО — иконки «Нет фото», не бейджа, — и дал бы ложный минус).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..", "..");
const abs = (rel: string): string => resolve(ROOT, rel);
const read = (rel: string): string => readFileSync(abs(rel), "utf8");

const THEMES = ["rose", "vanilla", "flux", "bloom", "satin"] as const;

interface BadgeFileCheck {
  path: string;
  /** Ровно то, что несла разметка бейджа ДО правки (git-история, см. шапку). */
  oldHardcode: string[];
  /** Сколько раз `merfy-badge` должен встретиться после правки. */
  badgeOccurrences: number;
}

const BADGE_FILES: BadgeFileCheck[] = [
  // SSG-компоненты порта (карточка каталога/коллекции).
  {
    path: "packages/theme-flux/blocks/Catalog/FluxProductCard.astro",
    oldHardcode: ["bg-[#FA5109]", "text-white"],
    badgeOccurrences: 1,
  },
  {
    path: "packages/theme-rose/blocks/Catalog/RoseProductCard.astro",
    oldHardcode: ["bg-[rgb(var(--color-accent,0_0_0))]", "!text-white"],
    badgeOccurrences: 1,
  },
  {
    path: "packages/theme-bloom/blocks/Catalog/BloomProductCard.astro",
    oldHardcode: ["bg-[rgb(var(--color-accent,227_142_159))]", "!text-white"],
    badgeOccurrences: 1,
  },
  {
    path: "packages/theme-satin/blocks/Catalog/SatinProductCard.astro",
    oldHardcode: ["bg-[#000000]", "text-white"],
    badgeOccurrences: 1,
  },
  // Клиентские render*Html-миррор (перерисовка после фильтра/сортировки/пагинации).
  {
    path: "packages/theme-flux/blocks/Catalog/Catalog.astro",
    oldHardcode: ["bg-[#FA5109]", "text-white"],
    badgeOccurrences: 1,
  },
  {
    path: "packages/theme-satin/blocks/Catalog/Catalog.astro",
    oldHardcode: ["bg-[#000000]", "text-white"],
    badgeOccurrences: 1,
  },
  {
    path: "packages/theme-satin/blocks/Catalog/storefront-hydrate.ts",
    oldHardcode: ["bg-[#000000] px-2 font-manrope text-[12px] font-medium uppercase leading-none text-white"],
    badgeOccurrences: 1,
  },
  // Legacy-копии (themes/<t>/src) — их же Tailwind живой сборки сканирует.
  {
    path: "themes/flux/src/components/products/FluxProductCard.astro",
    oldHardcode: ["bg-[#FA5109] px-1.5 py-1 font-roboto-flex text-[12px] font-light leading-none text-white"],
    badgeOccurrences: 3,
  },
  {
    path: "themes/flux/src/lib/storefront-hydrate.ts",
    oldHardcode: ["bg-[#FA5109] px-1.5 py-1 font-roboto-flex text-[12px] font-light leading-none text-white"],
    badgeOccurrences: 1,
  },
  {
    path: "themes/satin/src/lib/storefront-hydrate.ts",
    oldHardcode: ["bg-[#000000] px-2 font-manrope text-[12px] font-medium uppercase leading-none text-white"],
    badgeOccurrences: 1,
  },
  // Страница товара (PDP) — общий для всех 5 тем блок, 4 варианта layout.
  {
    path: "packages/theme-base/blocks/Product/ProductGallery.astro",
    oldHardcode: ["style=\"background:rgb(var(--color-text)); color:rgb(var(--color-bg));\""],
    badgeOccurrences: 4,
  },
];

describe("бейдж карточки/товара красится ролью схемы «Кнопка», не хардкодом", () => {
  it.each(BADGE_FILES)(
    "$path: старый хардкод бейджа снят, merfy-badge на месте",
    ({ path, oldHardcode, badgeOccurrences }) => {
      expect(existsSync(abs(path))).toBe(true);
      const text = read(path);
      for (const needle of oldHardcode) {
        expect(text).not.toContain(needle);
      }
      const hits = text.match(/merfy-badge/g) ?? [];
      expect(hits.length).toBeGreaterThanOrEqual(badgeOccurrences);
    },
  );

  it("vanilla: бейдж «Скидка» на карточке каталога не рисуется — вне объёма правки", () => {
    // Фиксируем находку явно (не молчаливое допущение): если разметка
    // появится, следующий тест-кейс должен добавить её сюда с проверкой роли.
    const text = read("packages/theme-vanilla/blocks/Catalog/Catalog.astro");
    expect(text).not.toMatch(/Скидка/);
  });

  it(".merfy-badge берёт фон/текст из роли схемы «Кнопка» (base.css)", () => {
    const css = read("packages/theme-base/styles/base.css");
    const rule = /\.merfy-badge\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    const body = rule![1];
    expect(body).toMatch(/background-color:\s*rgb\(var\(--color-button-bg/);
    expect(body).toMatch(/color:\s*rgb\(var\(--color-button-text/);
  });

  it(".merfy-badge объявлен ВНЕ @layer base — иначе Tailwind @layer utilities его перебьёт", () => {
    const css = read("packages/theme-base/styles/base.css");
    // check-css-layers.mjs форсит атрибут-селекторы этого файла в @layer base
    // (там побеждают @layer utilities); класс .merfy-badge должен остаться
    // unlayered — проверяем это напрямую, не полагаясь на память о правиле.
    const layerMatch = /@layer\s+base\s*\{/.exec(css);
    expect(layerMatch).not.toBeNull();
    const start = layerMatch!.index! + layerMatch![0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    const layerBaseBody = css.slice(start, i - 1);
    expect(layerBaseBody).not.toMatch(/\.merfy-badge/);
    expect(css.slice(i)).toMatch(/\.merfy-badge/);
  });

  it.each(THEMES)(
    "%s: global.css подключает base.css через @import (не @source — минуя Tailwind-скан)",
    (theme) => {
      const css = read(`themes/${theme}/src/styles/global.css`);
      expect(css).toMatch(/@import\s+"[^"]*theme-base\/styles\/base\.css"/);
    },
  );
});

/**
 * Счётчик-плашка на иконке корзины/избранного в шапке flux — появляется,
 * когда в корзине (или избранном) есть товар («когда в корзине товар — так
 * же с бейджом, флоу», владелец 28.09). ТОЛЬКО flux: решение 15.09 сознательно
 * оставляло фон плашки фирменным навy (`#1e2952`, «сужение исключения
 * counter-badge» — поправили тогда только цифру на `--color-button-text`).
 * Сегодняшнее требование владельца отменяет это решение для flux конкретно;
 * другие темы не трогали (см. список ниже — у части та же болезнь, но не
 * в этом объёме).
 *
 * flux НЕ имеет `packages/theme-flux/blocks/Header` (нет override) — реальный
 * рендер и для витрины, и для превью конструктора (compile-theme-sections.mjs
 * читает `themes/flux/sections.map.json` → тот же файл) — это
 * `themes/flux/src/components/Header.astro`. Файл лежит внутри
 * `@source "../components/**"` (themes/flux/src/styles/global.css) — класс,
 * добавленный сюда, Tailwind живой сборки сканирует сам (ловушка «порт
 * не сканируется» здесь не действует, она про `packages/theme-<t>/blocks/**`).
 * Схему для этой обёртки ставит `page-generator.ts` генерически
 * (`<div class="color-scheme-N">` вокруг блока «Шапка» по полю «Цветовая
 * схема») — компонент её не читает и трогать не нужно.
 *
 * Клиентский код (`nt-cart.ts` renderBadges, `wishlist.ts` renderAll) красит
 * только `textContent`/`data-empty` — класс/цвет плашки не трогает, перерисовки
 * не переопределяют её вручную.
 */
describe("счётчик-плашка корзины/избранного в шапке flux — роль схемы «Кнопка»", () => {
  const HEADER = "themes/flux/src/components/Header.astro";

  it("flux: плашка (фон) больше не хардкод #1e2952, а --color-button-bg", () => {
    const text = read(HEADER);
    const badgeCls = /const badgeCls =\s*\n?\s*"([^"]+)"/.exec(text)?.[1];
    expect(badgeCls).toBeDefined();
    expect(badgeCls).not.toContain("bg-[#1e2952]");
    expect(badgeCls).toMatch(/bg-\[rgb\(var\(--color-button-bg,\s*30_41_82\)\)\]/);
    // Цифра — роль «Текст кнопки» — уже была верна 15.09, не должна была измениться.
    expect(badgeCls).toMatch(/text-\[rgb\(var\(--color-button-text,\s*255_255_255\)\)\]/);
  });

  it("flux: один источник badgeCls — 5 мест корзины + FluxWishlistLink (никто не дублирует хардкод)", () => {
    const text = read(HEADER);
    const cartSpans = text.match(/data-cart-count[\s\S]{0,40}class=\{badgeCls\}/g) ?? [];
    expect(cartSpans.length).toBeGreaterThanOrEqual(5);
    // Ничего, кроме переменной badgeCls, не красит фон бейджа литералом хекса.
    expect(text).not.toMatch(/bg-\[#[0-9a-fA-F]{3,6}\][^"]*data-\[empty=true\]:hidden/);

    const wishlistLink = read("themes/flux/src/components/FluxWishlistLink.astro");
    expect(wishlistLink).toMatch(/class=\{badgeCls\}/);
    expect(wishlistLink).not.toMatch(/bg-\[#[0-9a-fA-F]{3,6}\]/);
  });

  it("flux: Header.astro остаётся внутри @source «../components/**» — класс не мёртв на витрине", () => {
    const css = read("themes/flux/src/styles/global.css");
    expect(css).toMatch(/@source\s+"\.\.\/components\/\*\*/);
  });

  it("flux: обёртка схемы шапки ставится генерически в page-generator (Header её не читает)", () => {
    const pg = read("src/generator/page-generator.ts");
    expect(pg).toMatch(/color-scheme-\$\{schemeId\}/);
    // Header.astro сам colorScheme не деструктурирует — обёртка приходит снаружи.
    const header = read("themes/flux/src/components/Header.astro");
    expect(header).not.toMatch(/const\s*\{[^}]*\bcolorScheme\b[^}]*\}\s*=\s*(p|Astro\.props)/);
  });

  it.each(["bloom", "satin", "vanilla"] as const)(
    "%s: не трогали — своя роль/хардкод плашки остаётся как была (не в объёме)",
    (theme) => {
      const text = read(`themes/${theme}/src/components/Header.astro`);
      expect(text).toMatch(/data-cart-count/);
    },
  );

  it("rose: уже был верной ролью (--color-button-bg) до этой правки — не трогали", () => {
    const text = read("themes/rose/src/components/Header.astro");
    expect(text).toMatch(/bg-\[rgb\(var\(--color-button-bg,0_0_0\)\)\]/);
  });
});
