/**
 * Секция «Товар»: служебная подпись «Описание» на витрину не печатается.
 *
 * Баг-репорт тестировщика 2026-09-14 02:07 (магазин 7b64b7a527d2, тема rose):
 *   «В секции товар везде убрать слово ОПИСАНИЕ, это только название секции,
 *    все данные тянутся с админки».
 * «Описание» — подпись ПОДПАНЕЛИ в конструкторе (`Product.puckConfig.ts`:
 * `description: { type: 'disabledHint', label: 'Описание' }`). Она обязана
 * остаться в панели (состав параметров — канон) и обязана исчезнуть с витрины:
 * покупателю показывают текст товара из админки, а не имя настройки.
 *
 * ЗАМЕР «ДО» (живая цепочка, `render-theme-sections.mjs` с `live:true`,
 * 2026-09-14):
 *   rose / vanilla / satin / bloom → 1 узел-заголовок
 *       `<h2 …>Описание</h2>` (общий примитив theme-base ProductDescription);
 *   flux (`visualConfig.showDescription:true`) → 2 узла
 *       `<span …>Описание</span>` — подпись аккордеона в desktop- и
 *       mobile-дереве порта `FeaturedProduct.astro`.
 *   flux с дефолтами темы описание не рисует вовсе
 *       (`packages/theme-flux/theme.json` → blockDefaults.Product.visualConfig
 *        .showDescription = false), поэтому здесь флаг поднят руками — иначе
 *       проверка «заголовка нет» была бы вырожденной: не рисуется ничего.
 *
 * Портов у секции два, и оба обязаны выполнять один контракт (авторитет —
 * `dist/theme-sections/<тема>/manifest.json`):
 *   • packages/theme-base/blocks/Product/Product.astro          — rose, bloom, satin, vanilla
 *   • themes/flux/src/components/sections/FeaturedProduct.astro — flux
 *
 * Проверка идёт ДВУМЯ слоями:
 *   1) рендер пяти тем живой цепочкой — то, что видит покупатель на витрине и
 *      в превью конструктора (сама секция «Товар»);
 *   2) исходники PDP-портов тем (`*ProductDetail.astro`) — это НЕ блок, его
 *      нельзя позвать блок-рендером: он живёт страницей (`/products/<id>`
 *      demo-SSG) и остаётся телом `/product`, если пересадка секции
 *      (composeContentPagesIntoDist) не отработала. Тот же служебный заголовок
 *      там свой, отдельной строкой — грепом по узлу, честно помечено.
 *
 * Рендер требует сборки (тот же порядок, что в CI перед этим шагом):
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
/** Каталог магазина для flux: он резолвит товар HTTP-запросом во фронтматтере. */
const CATALOG_STUB = resolve(__dirname, "product-description-stub.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Маячок тела описания (дублирует stub — ESM-модуль в CJS-jest не импортируем). */
const DESCRIPTION_MARK = "ОПИСАНИЕ_ИЗ_АДМИНКИ_МАЯЧОК";

/** Собственный порт есть только у flux; остальные четыре рендерят theme-base. */
const pkgFor = (theme: Theme) => (theme === "flux" ? undefined : "theme-base");

const baseProps = (theme: Theme) => ({
  id: "Product-1",
  siteId: "test-site",
  // flux печатает описание ТОЛЬКО для реально разрешённого товара (стаб выше);
  // общий порт берёт текст из props.description.content.
  productId: theme === "flux" ? "p1" : "",
  colorScheme: "scheme-1",
  padding: { top: 40, bottom: 40 },
  description: { content: DESCRIPTION_MARK, size: "medium" },
  // flux прячет описание дефолтом темы — поднимаем, иначе проверять нечего.
  ...(theme === "flux" ? { visualConfig: { showDescription: true } } : {}),
});

/** Один рендер живой цепочкой. Возвращает HTML или бросает с причиной. */
function renderLive(theme: Theme): string {
  const jobs = [
    {
      block: "Product",
      pkg: pkgFor(theme),
      props: baseProps(theme),
      live: true,
    },
  ];
  const raw = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify(jobs)],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер «Товар» (${theme}) не дал HTML: ${JSON.stringify(row)}`,
    );
  }
  return row.html;
}

/**
 * Только разметка, без инлайн-скриптов гидрации.
 *
 * В скриптах секции слово «Описание» живёт комментарием («Аккордеон описания»)
 * и в селекторах. Искать по сырому HTML — значит проверять текст скрипта, а не
 * то, что увидит покупатель.
 */
const markupOnly = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, "");

/**
 * Узлы-заголовки со служебной подписью: элемент, ВЕСЬ текст которого — слово
 * «Описание» (с двоеточием или без, в любом регистре). Тело описания под такой
 * предикат не попадает: там текст товара, а не одно слово.
 */
const headingNodes = (markup: string): string[] =>
  [
    ...markup.matchAll(
      /<(h[1-6]|span|p|div|strong|b|legend|label)\b[^>]*>\s*Описание:?\s*<\/\1>/gi,
    ),
  ].map((m) => m[0].replace(/\s+/g, " "));

const built = (theme: Theme) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

// ───────────────────── слой 1: рендер секции пятью темами ─────────────────────

describe.each(THEMES)(
  "«Товар» / %s: подписи «Описание» на витрине нет",
  (theme) => {
    it("секции темы собраны (pnpm build:theme-sections)", () => {
      expect(built(theme)).toBe(true);
    });

    it("тело описания из админки на месте", () => {
      // Держит проверку ниже от вырождения: «заголовка нет» ценно только тогда,
      // когда сам блок описания отрисован.
      expect(markupOnly(renderLive(theme))).toContain(DESCRIPTION_MARK);
    });

    it("узла-заголовка со словом «Описание» в разметке нет", () => {
      expect(headingNodes(markupOnly(renderLive(theme)))).toEqual([]);
    });

    it("узость: соседние подписи секции не пострадали", () => {
      // Правка убирает ОДНУ служебную подпись, а не «все заголовки секции».
      // «Поделиться» и «Добавить в корзину» — настоящие подписи управления.
      const markup = markupOnly(renderLive(theme));
      expect(markup).toContain("Поделиться");
      expect(markup).toContain("Добавить в корзину");
    });
  },
);

// ───────── слой 2: PDP-порты тем (страница, блок-рендером не зовётся) ─────────

/** Путь → тема. rose свой PDP-порт удалил: его страница рендерит ту же секцию. */
const PDP_PORTS: { theme: string; file: string }[] = [
  {
    theme: "bloom",
    file: "themes/bloom/src/components/products/BloomProductDetail.astro",
  },
  {
    theme: "flux",
    file: "themes/flux/src/components/products/FluxProductDetail.astro",
  },
  {
    theme: "satin",
    file: "themes/satin/src/components/products/satinProductDetail.astro",
  },
  {
    theme: "vanilla",
    file: "themes/vanilla/src/components/products/VanillaProductDetail.astro",
  },
];

describe.each(PDP_PORTS)(
  "PDP-порт $theme: подписи «Описание» нет",
  ({ file }) => {
    it("в исходнике нет узла-заголовка со словом «Описание»", () => {
      const src = readFileSync(resolve(SITES_ROOT, file), "utf8");
      // Комментарии {/* … */} и <!-- … --> — не разметка, их слово не печатает.
      const withoutComments = src
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(headingNodes(withoutComments)).toEqual([]);
    });
  },
);

// ───────────────────────────── саботаж детектора ─────────────────────────────

describe("саботаж: детектор заголовка не вырожден", () => {
  it("прежняя разметка общего примитива ловится", () => {
    const before =
      '<div class="flex flex-col gap-2 w-full" data-product-description>' +
      '<h2 class="[font-family:var(--font-heading)] text-[20px] uppercase">\n  Описание\n</h2>' +
      `<p>${DESCRIPTION_MARK}</p></div>`;
    expect(headingNodes(before)).toHaveLength(1);
  });

  it("прежняя подпись аккордеона flux ловится", () => {
    const before =
      '<button type="button" data-cfg-spec-toggle aria-expanded="false">' +
      '<span class="font-roboto-flex text-[16px] uppercase">Описание</span></button>';
    expect(headingNodes(before)).toHaveLength(1);
  });

  it("тело описания заголовком НЕ считается", () => {
    // Иначе проверка «заголовка нет» стала бы «описания нет» — и прошла бы,
    // выкинув как раз те данные, которые тестировщик просил оставить.
    expect(headingNodes(`<p data-pdp-desc>${DESCRIPTION_MARK}</p>`)).toEqual(
      [],
    );
  });

  it("чужие заголовки секций детектор не трогает", () => {
    expect(headingNodes("<h2>Подписка</h2><p>Описание рассылки</p>")).toEqual(
      [],
    );
  });
});
