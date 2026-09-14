/**
 * Скругление «Медиа» обязано доезжать до медиа секции «Товар».
 *
 * Жалоба владельца 14.09: «в настройках темы при выставлении настройки
 * Закругления в пункте Медиа не применяется к медиа файлам в секции Товар».
 *
 * Замер живых витрин (страница товара, viewport 1440):
 *
 *   тема     --radius-media   радиус плитки героя
 *   rose     8px              8px   ← совпало СЛУЧАЙНО
 *   vanilla  0px              8px   ✗
 *   satin    0px              8px   ✗
 *   bloom    12px             8px   ✗
 *
 * Токен доезжает до `:root` (эмиттер `src/themes/tokens-css.ts`, панель пишет
 * `mediaRadius → --radius-media`) и работает у соседей: `Collections`,
 * `Gallery`, `Image`, `Hero`, `ImageWithText`, `Video` читают его классом
 * `rounded-[var(--radius-media)]`. Мимо шёл только «Товар»:
 *
 *   • `packages/theme-base/blocks/Product/ProductGallery.astro` (rose, vanilla,
 *     satin, bloom) держал `heroRadius`/`thumbRadius` литералами
 *     `rounded-[8px]` / `rounded-[12px]`;
 *   • `themes/flux/src/components/sections/FeaturedProduct.astro` (flux — свой
 *     порт по sections.map.json) — тот же литерал `rounded-[8px]` на плитках
 *     и миниатюрах.
 *
 * Отдельная улика: канон `Product.classes.ts` (`galleryMedia`/`galleryThumb`)
 * УЖЕ описывает скругление токеном, но галерея этот файл не импортирует —
 * канон был записан и не подключён. Подключать его целиком нельзя: он несёт
 * ещё и `w-full aspect-square`, свою заливку и `opacity-70` у миниатюр, то
 * есть переписал бы вёрстку всех четырёх макетов галереи. Поэтому чиним
 * разметку до токена, а канон здесь же делаем ПРОВЕРЯЕМЫМ.
 *
 * Мерим ЖИВОЙ рендер скомпилированного модуля той же лестницей, что витрина
 * (cascade + live), а не исходный текст: у секции четыре макета галереи
 * (split / carousel / two-columns / stacked) и разные маркеры узлов
 * (`data-product-hero` против `data-media-index`), и именно на этом
 * расхождении ломается замер по одному селектору.
 *
 * Скругление БЕЙДЖА скидки (`rounded-[4px]`) — не медиа, оно законно и сюда
 * не попадает: проверяются только узлы-носители медиа.
 *
 * Рендер требует сборки:
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
/**
 * Стаб каталога: vanilla/flux/bloom ходят за товаром HTTP-запросом во
 * фронтматтере, без него три темы из пяти рисуют плейсхолдер вместо галереи.
 * Общий с `product-name-text-case` — у его товара ровно два изображения,
 * этого хватает и плитке героя, и миниатюрам.
 */
const CATALOG_STUB = resolve(__dirname, "product-name-case-stub.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
type Theme = (typeof THEMES)[number];

const MEDIA_TOKEN = "--radius-media";

/** Узлы-носители медиа галереи товара в обоих портах. */
const MEDIA_MARKERS = [
  "data-product-hero", // обёртка главного изображения (split/carousel/stacked)
  "data-media-index", // плитка сетки (two-columns) и миниатюра
  "data-product-thumb", // кнопка-миниатюра
  "data-cfg-hero", // главное изображение порта flux
] as const;

const CATALOG = {
  collections: [
    {
      id: "col-1",
      name: "Хиты",
      slug: "hity",
      image: "/p1.png",
      productIds: ["p1"],
    },
  ],
  products: [
    {
      id: "p1",
      name: "Тестовый товар",
      slug: "tovar-1",
      image: "/p1.png",
      images: ["/p1.png", "/p1-b.png"],
      price: 2500,
      basePrice: 2500,
      compareAtPrice: null,
      collectionIds: ["col-1"],
    },
  ],
  publications: [],
};

const props = {
  id: "Product-1",
  siteId: "test-site",
  productId: "p1",
  colorScheme: "scheme-1",
  padding: { top: 40, bottom: 40 },
};

/**
 * Все макеты галереи. Мерить надо КАЖДЫЙ: скругление собирается двумя
 * переменными, и `thumbRadius` живёт только в `split`/`carousel`/`stacked` —
 * в `two-columns` (макет по умолчанию, он и стоит на живых стендах) плитки
 * рисуются `heroRadius`. Саботаж это поймал: правка только `thumbRadius`
 * роняла одну проверку из исходника и НИ ОДНОЙ из рендера.
 */
const LAYOUTS = ["two-columns", "split", "carousel", "stacked"] as const;
type Layout = (typeof LAYOUTS)[number];

const built = (theme: string) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

function renderProduct(theme: Theme, layout: Layout = "two-columns"): string {
  const jobs = [
    {
      block: "Product",
      props: { ...props, layout },
      cascade: true,
      live: true,
      catalog: CATALOG,
    },
  ];
  const raw = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify(jobs)],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const row = (
    JSON.parse(raw) as {
      html?: string;
      error?: string;
      missing?: boolean;
      pipelineError?: string;
    }[]
  )[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер «Товар» (${theme}, макет ${layout}) не дал HTML: ${JSON.stringify(row)}`,
    );
  }
  return row.html;
}

type MediaNode = { marker: string; cls: string; tag: string };

/** Все открывающие теги с маркером медиа + их class. */
function mediaNodes(html: string): MediaNode[] {
  const out: MediaNode[] = [];
  for (const marker of MEDIA_MARKERS) {
    const re = new RegExp(`<[a-z0-9]+[^>]*\\b${marker}\\b[^>]*>`, "gi");
    for (const m of html.matchAll(re)) {
      out.push({
        marker,
        tag: m[0],
        cls: /class="([^"]*)"/.exec(m[0])?.[1] ?? "",
      });
    }
  }
  return out;
}

/**
 * Литеральное скругление вида `rounded-[12px]` (но не `rounded-[var(…)]`).
 * БЕЗ флага `g`: с ним `.test()` держит `lastIndex` между вызовами и на
 * повторных проверках через раз возвращает false — сторож бы «зеленел» сам.
 */
const LITERAL_ROUNDED = /\brounded-\[\d+(?:\.\d+)?(?:px|rem|%)\]/;

describe("Секция «Товар»: скругление медиа читает токен темы", () => {
  it.each(THEMES)("%s — сборка секций есть", (theme) => {
    expect(built(theme)).toBe(true);
  });

  describe.each(THEMES)("%s", (theme: Theme) => {
    it.each(LAYOUTS)("макет %s — галерея отрисовалась", (layout) => {
      expect(mediaNodes(renderProduct(theme, layout)).length).toBeGreaterThan(0);
    });

    it.each(LAYOUTS)(
      "макет %s — каждый узел медиа скруглён токеном, а не числом",
      (layout) => {
        const bad = mediaNodes(renderProduct(theme, layout)).filter((n) =>
          LITERAL_ROUNDED.test(n.cls),
        );
        expect(bad.map((n) => `${n.marker}: ${n.cls.slice(0, 120)}`)).toEqual([]);
      },
    );

    it.each(LAYOUTS)(
      "макет %s — узлы медиа несут именно --radius-media",
      (layout) => {
        const nodes = mediaNodes(renderProduct(theme, layout));
        const withToken = nodes.filter((n) =>
          new RegExp(`rounded-\\[var\\(${MEDIA_TOKEN}[,)]`).test(n.cls),
        );
        expect(withToken.length).toBeGreaterThan(0);
      },
    );
  });

  describe("канон подключён, а не украшает полку", () => {
    it("Product.classes.ts описывает медиа галереи токеном", () => {
      const src = readFileSync(
        resolve(
          SITES_ROOT,
          "packages/theme-base/blocks/Product/Product.classes.ts",
        ),
        "utf-8",
      );
      for (const key of ["galleryMedia", "galleryThumb"]) {
        const decl = new RegExp(`${key}:[\\s\\S]{0,240}?,\\n`).exec(src)?.[0] ?? "";
        expect(decl).toContain(`rounded-[var(${MEDIA_TOKEN})]`);
      }
      // Роли, которые РЕАЛЬНО уезжают в разметку галереи.
      for (const key of [
        "galleryMediaRadius",
        "galleryMediaRadiusInlineSmall",
        "galleryThumbRadius",
      ]) {
        const decl = new RegExp(`${key}: *'([^']*)'`).exec(src)?.[1] ?? "";
        expect(decl).toMatch(
          new RegExp(`^rounded-\\[var\\(${MEDIA_TOKEN}(,\\d+px)?\\)\\]$`),
        );
      }
    });

    it("галерея ИМПОРТИРУЕТ канон, а не пишет классы сама", () => {
      const src = readFileSync(
        resolve(
          SITES_ROOT,
          "packages/theme-base/blocks/Product/ProductGallery.astro",
        ),
        "utf-8",
      );
      expect(src).toMatch(
        /import\s*\{[^}]*ProductClasses[^}]*\}\s*from\s*['"]\.\/Product\.classes['"]/,
      );
      // Скругление собирается из канона, а не литералом в этом файле.
      expect(src).toMatch(/heroRadius\s*=[\s\S]{0,160}?C\.galleryMediaRadius/);
      expect(src).toMatch(/thumbRadius\s*=\s*C\.galleryThumbRadius/);
    });

    it("исходники обоих портов не держат литерального скругления медиа", () => {
      const files = [
        "packages/theme-base/blocks/Product/ProductGallery.astro",
        "themes/flux/src/components/sections/FeaturedProduct.astro",
      ];
      const offenders: string[] = [];
      for (const rel of files) {
        const src = readFileSync(resolve(SITES_ROOT, rel), "utf-8");
        src.split("\n").forEach((line, i) => {
          if (!LITERAL_ROUNDED.test(line)) return;
          // Признак носителя медиа: обёртка КАДРИРУЕТ изображение
          // (`overflow-hidden`), несёт маркер узла галереи или собирает
          // переменную радиуса. Бейдж скидки и кнопки тоже скруглены
          // литералом, но ничего не кадрируют — они сюда не попадают.
          const isMedia =
            line.includes("overflow-hidden") ||
            MEDIA_MARKERS.some((m) => line.includes(m)) ||
            /heroRadius|thumbRadius/.test(line);
          if (isMedia) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
      }
      expect(offenders).toEqual([]);
    });
  });
});
