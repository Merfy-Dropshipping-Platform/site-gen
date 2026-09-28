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
 * ОХВАТ. КАРТОЧКА КАТАЛОГА (packages/theme-<t>/blocks/Catalog) — 4 темы:
 * rose, bloom, satin, flux; vanilla там бейджа НЕ рисует вовсе (проверено
 * ниже отдельным тестом — это правда только про каталог, не про витрину
 * целиком). Каждый порт несёт бейдж в ДВУХ местах: SSG-компонент (.astro,
 * рисует первую загрузку страницы) И клиентский `render*Html`-миррор
 * (перерисовывает карточки после фильтра/сортировки/пагинации, живёт в самом
 * Catalog.astro или в соседнем storefront-hydrate.ts) — оба обязаны
 * совпадать, иначе после фильтра бейдж откатится на старый цвет.
 *
 * «ПОПУЛЯРНЫЕ ТОВАРЫ»/«КОЛЛЕКЦИИ» (ревью Opus 28.09: моё первое ОХВАТ было
 * НЕПОЛНЫМ — на этих секциях витрина рисует СОВСЕМ ДРУГУЮ карточку,
 * `themes/<t>/src/components/products/<T>ProductCard.astro`, а не пакетный
 * порт каталога) — 5 тем, включая vanilla (`VanillaProductCard.astro:87`,
 * `bg-[var(--vanilla-announcement-bg)]` — фирменный, НЕ роль схемы; у vanilla
 * бейдж ЕСТЬ, просто не на карточке каталога). У satin SSR этой карточки был
 * НЕ синхронизирован с client-гидрацией (`lib/storefront-hydrate.ts`, уже на
 * merfy-badge) — первый кадр красился accent, после гидрации — button-role
 * (моргание цветом).
 *
 * ОСТАЛЬНЫЕ ЖИВЫЕ КОПИИ ТОЙ ЖЕ РАЗМЕТКИ: избранное satin
 * (`WishlistSection.astro`, своя inline `renderCardHtml`); живой поиск из
 * лупы в шапке — rose/bloom/satin (`lib/header-search-view.ts`, ДВЕ карточки
 * на тему — панель и шторка-дровер); СТРОКА КОРЗИНЫ flux
 * (`lib/cart-thumb-html.ts` + INLINE-копии в `CartBody.astro`/
 * `CartSection.astro` — client re-render после add/remove) — это и есть
 * «в корзине — так же с бейджом» из исходной жалобы владельца (см. историю
 * ниже); у остальных 4 тем в корзине/дровере бейджа НЕТ вовсе (проверено,
 * см. `cart-thumb-html.ts`/`CartBody.astro`/`CartSection.astro` каждой темы —
 * не грепится «Скидка»/«Новинка»).
 *
 * Legacy-копии (`themes/<t>/src/...`) — их же Tailwind живой сборки сканирует
 * (`@source "../components/**"` / `"../lib/**"`); мёртвый хардкод там не
 * рендерится (кроме случаев выше, где эти файлы ЖИВЫЕ), но остаётся в CSS
 * витрины и вводит в заблуждение.
 *
 * Плюс страница товара (PDP) — общий для всех 5 тем `ProductGallery.astro`
 * (theme-base), роль там ДО правки была третья, своя: `--color-text`/
 * `--color-bg` (инверсия текста страницы), тоже не «Кнопка».
 *
 * ВНЕ ОБЪЁМА (найдено, не чинил — см. описания в самих `it`):
 *   - каталог rose/bloom: клиентский `render*Html`-миррор вообще не рисует
 *     бейдж после фильтра/сортировки (пропадает) — отдельный баг, не про цвет;
 *   - счётчик-плашка корзины/избранного в шапке bloom/satin/vanilla — свой
 *     фирменный хардкод, не тронут (flux — тронут, см. блок ниже).
 *
 * Проверка «без хардкода» — ТОЧНЫЕ старые подстроки (не общий шаблон вроде
 * `--color-accent`, который легитимно встречается в ProductGallery.astro для
 * ДРУГОГО — иконки «Нет фото», не бейджа, — и дал бы ложный минус).
 *
 * ПОВЕДЕНЧЕСКИЕ ПРОВЕРКИ (ревью Opus 28.09: строковый греп не ловит «файл не
 * компилируется»/«роль не доезжает до реального узла») — ниже, отдельными
 * describe: рендер через `render-theme-sections.mjs` (тот же модуль, что
 * уходит на витрину/в превью — см. `satin-b39-render-scheme-guards.spec.ts`)
 * с РЕАЛЬНЫМ товаром со скидкой. Не для всех тем: PopularProducts
 * bloom/vanilla/flux тянет товары СЕРВЕРНЫМ HTTP-запросом к
 * `/api/sites/:id/storefront-data` (нет способа подставить фикстуру через
 * этот тестовый харнесс без живого сервиса) — там остаётся только строковая
 * проверка выше; rose/satin читают `__merfy.resolved.popularProducts` —
 * фикстура `catalog` в job долетает, рендер настоящий.
 */
import { execFileSync } from "node:child_process";
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
  // «Популярные товары»/«Коллекции» — СОВСЕМ ДРУГАЯ карточка (не пакетный
  // порт каталога): themes/<t>/src/components/products/<T>ProductCard.astro,
  // зовётся из themes/<t>/src/components/sections/Popular.astro (все 5 тем) и,
  // у bloom, Collections.astro:20. Найдено ревью Opus 28.09 — моё первое ОХВАТ
  // это пропустило.
  {
    path: "themes/rose/src/components/products/RoseProductCard.astro",
    oldHardcode: ["bg-[rgb(var(--color-accent,0_0_0))]", "!text-white"],
    badgeOccurrences: 1,
  },
  {
    path: "themes/bloom/src/components/products/BloomProductCard.astro",
    oldHardcode: ["bg-[rgb(var(--color-accent,227_142_159))]", "text-white"],
    badgeOccurrences: 1,
  },
  {
    path: "themes/satin/src/components/products/SatinProductCard.astro",
    // Была своя, ЕЩЁ не хардкод-версия (--color-accent, "эталон rose" —
    // предыдущая волна): рассинхрон с client-гидрацией (storefront-hydrate.ts,
    // уже на merfy-badge) — первый кадр одного цвета, после гидрации другого.
    oldHardcode: ["bg-[rgb(var(--color-accent,0_0_0))]"],
    badgeOccurrences: 1,
  },
  {
    path: "themes/vanilla/src/components/products/VanillaProductCard.astro",
    // Фирменный алиас темы (шапка-анонс), НЕ роль схемы вовсе — другой
    // хардкод, чем у остальных четырёх тем, но та же болезнь.
    oldHardcode: ["bg-[var(--vanilla-announcement-bg)]"],
    badgeOccurrences: 1,
  },
  // Избранное satin — своя inline renderCardHtml (та же болезнь, что была в
  // SatinProductCard.astro/storefront-hydrate.ts до предыдущей волны).
  {
    path: "themes/satin/src/components/sections/WishlistSection.astro",
    oldHardcode: ["bg-[#000000] px-2 font-manrope text-[12px] font-medium uppercase leading-none text-white"],
    badgeOccurrences: 1,
  },
  // Живой поиск из лупы в шапке — панель (десктоп) + шторка-дровер (мобайл),
  // по 2 карточки-рендера на тему (rose), 1 на тему (bloom/satin — общая
  // функция на оба вида). vanilla/flux в поиске бейдж не рисуют (не в объёме).
  {
    path: "themes/rose/src/lib/header-search-view.ts",
    oldHardcode: ["bg-[rgb(var(--color-accent,0_0_0))]", "!text-white"],
    badgeOccurrences: 2,
  },
  {
    path: "themes/bloom/src/lib/header-search-view.ts",
    // Полная строка класса бейджа, не голый триплет: тот же --color-accent
    // легитимно красит точки-переключатель фото (dots()) — другой узел,
    // трогать не нужно, и голый триплет как needle дал бы ложный минус.
    oldHardcode: [
      "bg-[rgb(var(--color-accent,227_142_159))] px-1.5 font-inter text-[12px] font-light leading-[15px] !text-white",
    ],
    badgeOccurrences: 1,
  },
  {
    path: "themes/satin/src/lib/header-search-view.ts",
    oldHardcode: ["bg-[rgb(var(--color-accent,0_0_0))]", "text-white"],
    badgeOccurrences: 1,
  },
  // Строка КОРЗИНЫ flux (/cart, СТРАНИЦА, не дровер) — то самое «в корзине
  // так же с бейджом» из исходной жалобы владельца (найдено ревью Opus 28.09,
  // моя первая волна искала в theme-base CartBody/CartSection, не в legacy
  // themes/flux/src/lib/cart-thumb-html.ts — совсем другой файл).
  // Дублируется в 3 местах: серверный SSR-рендер thumbHtml (cart-thumb-html.ts,
  // экспорт cartLinePictureHtml) + два ПОЧТИ идентичных inline client-миррора
  // (CartBody.astro/CartSection.astro, перерисовка после add/remove/±).
  {
    path: "themes/flux/src/lib/cart-thumb-html.ts",
    oldHardcode: ["bg-[#FA5109] px-1.5 py-1 font-roboto-flex text-[12px] font-light leading-normal text-white"],
    badgeOccurrences: 2, // «Новинка» + «-N%», один и тот же класс-литерал дважды
  },
  {
    path: "themes/flux/src/components/sections/CartBody.astro",
    oldHardcode: ["bg-[rgb(var(--color-accent,250_81_9))]"],
    badgeOccurrences: 1,
  },
  {
    path: "themes/flux/src/components/sections/CartSection.astro",
    oldHardcode: ["bg-[rgb(var(--color-accent,250_81_9))]"],
    badgeOccurrences: 1,
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

  it("vanilla: на КАРТОЧКЕ КАТАЛОГА бейджа нет (не путать с «Популярными товарами» — там есть, см. BADGE_FILES выше)", () => {
    // Фиксируем находку явно (не молчаливое допущение): если разметка
    // появится, следующий тест-кейс должен добавить её сюда с проверкой роли.
    // ⚠️ Ревью Opus 28.09: эта проверка про Catalog-порт узко, не про всю
    // витрину — на «Популярных товарах»/«Коллекциях» у vanilla бейдж ЕСТЬ
    // (VanillaProductCard.astro, отдельная запись выше).
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
 * ПОВЕДЕНЧЕСКИЕ проверки (ревью Opus 28.09): рендер РЕАЛЬНОГО модуля темы
 * (dist/theme-sections/<тема>/manifest.json — тот же, что уходит на витрину и
 * в превью конструктора) с настоящим товаром со скидкой, по образцу
 * `satin-b39-render-scheme-guards.spec.ts`. Строковый греп по исходнику (блок
 * выше) не ловит «файл не компилируется» и «роль не доезжает до РЕАЛЬНОГО
 * узла разметки» — здесь узел приходит из настоящего Astro Container API
 * рендера, а не из текста файла.
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");

function renderSections(theme: string, jobs: unknown[]): Array<{ html?: string; error?: string; missing?: boolean }> {
  const out = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function renderHtml(theme: string, jobs: unknown[]): string {
  const [row] = renderSections(theme, jobs);
  if (!row || typeof row.html !== "string") {
    throw new Error(`рендер не дал HTML (${theme}): ${JSON.stringify(row)}`);
  }
  return row.html;
}

const SECTIONS_BUILT = (theme: string): boolean =>
  existsSync(abs(`dist/theme-sections/${theme}/manifest.json`));

describe("рендер PopularProducts с реальным товаром со скидкой: merfy-badge на карточке", () => {
  // Только rose и satin читают __merfy.resolved.popularProducts (фикстура
  // catalog в job долетает до рендера). bloom/vanilla/flux тянут товары
  // СЕРВЕРНЫМ fetch к /api/sites/:id/storefront-data внутри Popular.astro —
  // этот харнесс живой сервис не поднимает, фикстуру подставить некуда;
  // покрыты строковой проверкой в блоке выше (BADGE_FILES).
  const THEMES_WITH_CATALOG_PROP = ["rose"] as const;
  const catalogFixture = {
    products: [
      {
        id: "p1",
        name: "Свитер оверсайз",
        price: 2500,
        oldPrice: 3500,
        discount: true,
        images: ["https://cdn.example.test/sweater.jpg"],
        collectionIds: ["col-1"],
      },
    ],
    collections: [{ id: "col-1", slug: "col-1", name: "Коллекция 1", productIds: ["p1"] }],
  };

  it.each(THEMES_WITH_CATALOG_PROP)("%s: секции собраны (pnpm build:theme-sections %s)", (theme) => {
    expect(SECTIONS_BUILT(theme)).toBe(true);
  });

  it.each(THEMES_WITH_CATALOG_PROP)(
    "%s: узел «Скидка» рендерится с merfy-badge, без accent/хардкода",
    (theme) => {
      if (!SECTIONS_BUILT(theme)) return;
      const out = renderHtml(theme, [
        {
          block: "PopularProducts",
          props: { id: "Popular-badge-behavior", colorScheme: "scheme-2", cards: 1, collection: "col-1" },
          cascade: true,
          live: true,
          catalog: catalogFixture,
        },
      ]);
      const badgeTag = /<span class="([^"]*)"[^>]*>\s*(?:\n\s*)?Скидка\s*<\/span>/.exec(out);
      expect(badgeTag).not.toBeNull();
      expect(badgeTag![1]).toContain("merfy-badge");
      expect(badgeTag![1]).not.toMatch(/--color-accent|bg-\[#/);
    },
  );
});

describe("рендер flux Catalog/CartBody/CartSection: компилируются, script несёт merfy-badge", () => {
  const FLUX_BUILT = SECTIONS_BUILT("flux");

  it("flux: секции собраны (pnpm build:theme-sections flux)", () => {
    expect(FLUX_BUILT).toBe(true);
  });

  it.each(["Catalog", "CartBody", "CartSection"] as const)(
    "flux %s: рендерится без ошибок",
    (block) => {
      if (!FLUX_BUILT) return;
      const [row] = renderSections("flux", [
        { block, props: { id: `${block}-behavior`, colorScheme: "scheme-2" }, cascade: true, live: true },
      ]);
      expect(row?.error).toBeUndefined();
      expect(row?.missing).not.toBe(true);
      expect(typeof row?.html).toBe("string");
    },
  );

  it("flux Catalog: client cardSaleBadgeHtml() несёт класс merfy-badge на самом узле (не только в комментарии), не bg-[#FA5109] на плашке", () => {
    if (!FLUX_BUILT) return;
    const out = renderHtml("flux", [
      { block: "Catalog", props: { id: "Catalog-behavior", colorScheme: "scheme-2" }, cascade: true, live: true },
    ]);
    expect(out).toMatch(/<span class="merfy-badge inline-flex items-center justify-center rounded-\[4px\]/);
    expect(out).not.toMatch(/<span class="[^"]*bg-\[#FA5109\]/);
  });

  it.each(["CartBody", "CartSection"] as const)(
    "flux %s: client-миррор строки корзины несёт merfy-badge на плашке, не --color-accent,250_81_9",
    (block) => {
      if (!FLUX_BUILT) return;
      const out = renderHtml("flux", [
        { block, props: { id: `${block}-behavior` }, cascade: true, live: true },
      ]);
      expect(out).toMatch(/<span class="merfy-badge flex items-center justify-center rounded-\[2px\]/);
      expect(out).not.toMatch(/--color-accent,250_81_9/);
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
