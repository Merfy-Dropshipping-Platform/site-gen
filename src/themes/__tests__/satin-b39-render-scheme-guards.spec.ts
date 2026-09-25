/**
 * Сторожи волны b39 (баг-репорт владельца 2026-09-16, тема satin — РЕНДЕР,
 * не сайдбар). Один блок describe на баг, по одной сторожевой клетке минимум.
 *
 * 1. Hero/«Изображение»: ОДНО фото не делит секцию пополам (как при двух).
 *    Замер df865fb0 (уже на main ДО этой волны) — full-bleed ветка (!hasMerchantText)
 *    и сплит-ветка обе проверены через живой пайплайн: ни один код-путь grid-cols-2
 *    при одном фото не даёт. Этот сторож фиксирует пробел покрытия — существующий
 *    src/themes/__tests__/hero-media-slots.spec.ts всегда задаёт реальные heading/
 *    text/primaryButton → проверяет только СПЛИТ-ветку. Full-bleed ветка (мерчант
 *    тронул только фото, текст остался дефолтным) не была покрыта вовсе.
 *
 * 2. Hero/«Изображение»: цветовая схема на дополнительной (secondary) кнопке.
 *    Замер: --color-button-2-text/-border эмитятся buildTokensCss дифференцированно
 *    по схемам satin (scheme-1 "0 0 0" против scheme-4 "255 255 255", theme.json),
 *    и Hero.astro (BTN_LIGHT) их читает, а не хардкод. Баг не воспроизведён —
 *    сторож фиксирует контракт, чтобы регрессия (частичный откат на литерал) сразу
 *    краснела.
 *
 * 3. «Коллекция товаров» (PopularProducts) satin: кнопка «Смотреть ещё» и плашка
 *    «Скидка» карточки товара. ДО этой волны:
 *      .satin-button-light { color: var(--satin-black); border-color: var(--satin-black) }
 *      SatinProductCard.astro: bg-[#000000] на плашке «Скидка»
 *    оба — литералы темы, НЕ токены схемы (--satin-black не переопределяется
 *    .color-scheme-N). Правка (эта волна): .satin-button-light → --color-button-2-*
 *    (тот же токен, что уже красит вторую кнопку Hero); плашка «Скидка» → --color-accent
 *    (эталон rose: RoseProductCard.astro).
 *
 * 4. Секция «Корзина» satin (CartBody.astro / CartSection.astro): плашка количества
 *    (−/N/+) в строке товара. ДО: обёртка степпера не несла color вовсе → наследовала
 *    `body { color: var(--satin-black) }` (тема, не схема) — чёрный текст на любой,
 *    включая тёмную, схеме. Название товара и цена уже были на --color-text (не
 *    воспроизведено — проверено тем же замером, см. отчёт). Правка: обёртка степпера
 *    получает text-[rgb(var(--color-text,0_0_0))].
 *
 * Разметка строки корзины собирается client-side JS (itemsEl.innerHTML = ...),
 * Astro SSR её не рендерит — сторож 4 проверяет ИСХОДНИК (тот же .astro файл,
 * что уходит в браузер как <script>), а не HTML вывод рендерера.
 *
 * Рендер (1-3) требует сборки: pnpm build && pnpm build:blocks &&
 * pnpm exec tsx scripts/run-theme-build.ts satin (или compile-theme-sections.mjs satin).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const read = (rel: string) => readFileSync(resolve(SITES_ROOT, rel), "utf8");

type RenderRow = { html?: string; error?: string; pipelineError?: string; missing?: boolean };

function render(theme: string, jobs: unknown[]): RenderRow[] {
  const out = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as RenderRow[];
}

function html(theme: string, jobs: unknown[]): string {
  const [row] = render(theme, jobs);
  if (!row || typeof row.html !== "string") {
    throw new Error(`рендер не дал HTML (${theme}): ${JSON.stringify(row)}`);
  }
  return row.html;
}

const built = existsSync(resolve(SITES_ROOT, "dist", "theme-sections", "satin", "manifest.json"));

function tokenValue(tokensCss: string, schemeId: string, token: string): string {
  const n = schemeId.replace("scheme-", "");
  const body = new RegExp(`\\.color-scheme-${n}\\s*\\{([^}]*)\\}`).exec(tokensCss)?.[1] ?? "";
  const value = new RegExp(`${token}:\\s*([^;]+)`).exec(body)?.[1]?.trim();
  if (!value) throw new Error(`токен ${token} не объявлен у ${schemeId} (satin)`);
  return value;
}

describe("satin b39: секции собраны (pnpm build:theme-sections satin)", () => {
  it("dist/theme-sections/satin/manifest.json существует", () => {
    expect(built).toBe(true);
  });
});

if (built) {
  // ── БАГ 1 — Hero: одно фото не делит секцию пополам ───────────────────────
  describe("баг 1: Hero satin, одно фото — секция цельная (не как при двух)", () => {
    it("full-bleed ветка (текст/кнопка не заданы мерчантом): ровно один кадр мерчанта, БЕЗ grid-cols-2", () => {
      const out = html("satin", [
        {
          block: "Hero",
          props: {
            id: "Hero-b39-1",
            colorScheme: "scheme-1",
            backgroundImages: { url1: "https://cdn.example.test/only-photo.jpg" },
          },
          cascade: true,
          live: true,
        },
      ]);
      expect(out).not.toMatch(/grid-cols-2/);
      const merchantImgs = (out.match(/<img\b[^>]*>/g) ?? []).filter((tag) =>
        tag.includes("only-photo.jpg"),
      );
      expect(merchantImgs).toHaveLength(1);
    });

    it("full-bleed ветка, фото ТОЛЬКО во втором слоте: тот же контракт (саботаж owner-репорта)", () => {
      const out = html("satin", [
        {
          block: "Hero",
          props: {
            id: "Hero-b39-1b",
            colorScheme: "scheme-1",
            backgroundImages: { url2: "https://cdn.example.test/second-slot.jpg" },
          },
          cascade: true,
          live: true,
        },
      ]);
      expect(out).not.toMatch(/grid-cols-2/);
      expect(out).not.toContain("/placeholders/landscape-image.png");
      const merchantImgs = (out.match(/<img\b[^>]*>/g) ?? []).filter((tag) =>
        tag.includes("second-slot.jpg"),
      );
      expect(merchantImgs).toHaveLength(1);
    });

    it("b96: full-bleed ветка НЕ ломается, когда cta уже материализован ДЕФОЛТНЫМ текстом «Кнопка» (deepMergeBlockProps домешивает дефолт темы в props при ЛЮБОЙ правке панели — не обязательно самой кнопки; owner-репорт: «делится на две части при любом изменении, даже при загрузке одного фото»)", () => {
      const out = html("satin", [
        {
          block: "Hero",
          props: {
            id: "Hero-b96-1",
            colorScheme: "scheme-2",
            cta: { text: "Кнопка", href: "/catalog" },
            backgroundImages: { url1: "https://cdn.example.test/only-photo.jpg" },
          },
          cascade: true,
          live: true,
        },
      ]);
      expect(out).not.toMatch(/grid-cols-2/);
      expect(out).not.toContain("satin-bleed-left");
      const merchantImgs = (out.match(/<img\b[^>]*>/g) ?? []).filter((tag) =>
        tag.includes("only-photo.jpg"),
      );
      expect(merchantImgs).toHaveLength(1);
    });

    it("full-bleed ветка, ДВА фото: деление законно (контроль — не всегда «нет сплита»)", () => {
      const out = html("satin", [
        {
          block: "Hero",
          props: {
            id: "Hero-b39-1c",
            colorScheme: "scheme-1",
            backgroundImages: {
              url1: "https://cdn.example.test/a.jpg",
              url2: "https://cdn.example.test/b.jpg",
            },
          },
          cascade: true,
          live: true,
        },
      ]);
      expect(out).toMatch(/grid-cols-2/);
    });
  });

  // ── БАГ 2 — Hero: схема на дополнительной кнопке ──────────────────────────
  describe("баг 2: Hero satin secondaryButton — цвет от схемы, не литерал", () => {
    function secondaryButtonTag(scheme: string): string {
      const out = html("satin", [
        {
          block: "Hero",
          props: {
            id: "Hero-b39-2",
            colorScheme: scheme,
            heading: { text: "Заголовок" },
            secondaryButton: { text: "Ещё", link: { href: "/catalog" } },
            backgroundImages: { url1: "https://cdn.example.test/a.jpg" },
          },
          cascade: true,
          live: true,
        },
      ]);
      const tag = /<a[^>]*data-puck-subsection-field="secondaryButton"[^>]*>/.exec(out)?.[0];
      if (!tag) throw new Error("secondaryButton не найден в разметке Hero");
      return tag;
    }

    it("кнопка несёт роль «Дополнительная» схемы (не хардкод-цвет)", () => {
      // С 25.09 цвета даёт правило роли (data-scheme-button,
      // src/themes/scheme-buttons.ts): Фон/Текст/Обводка «Дополнительной
      // кнопки» → фон/текст/рамка. Нарисованное меряет scheme-button-roles.spec.ts.
      const tag = secondaryButtonTag("scheme-1");
      expect(tag).toMatch(/data-scheme-button="secondary"/);
      expect(tag).not.toMatch(/(?:bg|text|border)-\[(?:#|rgb\(\d)/);
    });

    it("scheme-1 (светлая) и scheme-4 (тёмная) satin реально дают РАЗНЫЙ --color-button-2-text", () => {
      const tokensCss = buildTokensCss({}, "satin");
      const light = tokenValue(tokensCss, "scheme-1", "--color-button-2-text");
      const dark = tokenValue(tokensCss, "scheme-4", "--color-button-2-text");
      expect(light).toBe("0 0 0");
      expect(dark).toBe("255 255 255");
      expect(light).not.toBe(dark);
    });
  });

  // ── БАГ 3 — «Коллекция товаров»: «Смотреть ещё» + плашка «Скидка» ─────────
  describe("баг 3: «Коллекция товаров» satin — схема красит «Смотреть ещё» и «Скидку»", () => {
    it(".satin-button-light (global.css) читает --color-button-2-*, а не --satin-black", () => {
      const css = read("themes/satin/src/styles/global.css");
      const rule = /\.satin-button-light\s*\{([^}]*)\}/.exec(css)?.[1];
      if (!rule) throw new Error("в global.css нет правила .satin-button-light");
      expect(rule).toMatch(/color:\s*rgb\(var\(--color-button-2-text/);
      expect(rule).toMatch(/border-color:\s*rgb\(var\(--color-button-2-border/);
      // Только объявления (без /* … */): комментарий рядом упоминает
      // --satin-black для контекста, это не регрессия.
      const declarations = rule.replace(/\/\*[\s\S]*?\*\//g, "");
      expect(declarations).not.toMatch(/--satin-black/);
    });

    it("плашка «Скидка» (SatinProductCard.astro) красится --color-accent, не bg-[#000000]", () => {
      const src = read("themes/satin/src/components/products/SatinProductCard.astro");
      const badge = /<span class="([^"]*)"[^>]*>\s*Скидка\s*<\/span>/.exec(src);
      if (!badge) throw new Error("плашка «Скидка» не найдена в SatinProductCard.astro");
      expect(badge[1]).toContain("bg-[rgb(var(--color-accent,0_0_0))]");
      expect(badge[1]).not.toContain("#000000");
    });

    it("рендер PopularProducts (реальный товар со скидкой, colorScheme=scheme-4): оба узла на схемных токенах", () => {
      const catalog = {
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
      const out = html("satin", [
        {
          block: "PopularProducts",
          props: {
            id: "Popular-b39-3",
            colorScheme: "scheme-4",
            buttonStyle: "secondary",
            cards: 1,
            collection: "col-1",
          },
          cascade: true,
          live: true,
          catalog,
        },
      ]);
      expect(out).toContain("satin-button-light");
      expect(out).toContain('data-puck-subsection-field="viewAll"');
      expect(out).toMatch(/bg-\[rgb\(var\(--color-accent,0_0_0\)\)\][^"]*"[^>]*>\s*\n?\s*Скидка/);
      expect(out).not.toMatch(/bg-\[#000000\][^>]*>\s*\n?\s*Скидка/);
    });
  });

  // ── БАГ 4 — «Корзина»: плашка количества ──────────────────────────────────
  describe("баг 4: секция «Корзина» satin — плашка количества (−/N/+) на схеме", () => {
    const CART_FILES = [
      "themes/satin/src/components/sections/CartBody.astro",
      "themes/satin/src/components/sections/CartSection.astro",
    ];
    const STEPPER_OPEN =
      '<div class="inline-flex h-10 items-center rounded-[4px] border border-[rgb(var(--color-muted,153_153_153)/0.3)]';

    it.each(CART_FILES)("%s: строка товара несёт --color-text (не название/цена)", (rel) => {
      const src = read(rel);
      expect(src).toContain(
        '<a href="/products/${line.productId}" class="font-manrope text-[16px] font-normal text-[rgb(var(--color-text,0_0_0))]',
      );
    });

    it.each(CART_FILES)("%s: обёртка степпера ЯВНО красится text-[rgb(var(--color-text,...))]", (rel) => {
      const src = read(rel);
      const idx = src.indexOf(STEPPER_OPEN);
      if (idx === -1) throw new Error(`обёртка степпера не найдена в ${rel}`);
      const tagEnd = src.indexOf(">", idx);
      const openTag = src.slice(idx, tagEnd + 1);
      expect(openTag).toContain("text-[rgb(var(--color-text,0_0_0))]");
    });

    it.each(CART_FILES)(
      "%s: цифра количества и кнопки −/+ САМИ не красятся (цвет наследуют от обёртки)",
      (rel) => {
        const src = read(rel);
        expect(src).toContain(
          '<span class="min-w-[28px] text-center font-manrope text-[14px]">${line.quantity}</span>',
        );
        expect(src).toMatch(/data-cart-dec[^>]*class="flex h-10 w-10 items-center justify-center"/);
        expect(src).toMatch(/data-cart-inc[^>]*class="flex h-10 w-10 items-center justify-center"/);
      },
    );
  });
}
