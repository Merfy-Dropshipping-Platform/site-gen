/**
 * Название товара: витрина показывает то, что мерчант завёл в админке.
 *
 * Баг-репорт тестировщика 2026-09-14: «Капс в названии товара. Ожидаемый
 * результат: тянет с админки название, а не сам пишет капсом».
 *
 * Это тот же класс, что `section-text-case.spec.ts` («мерчант пишет НЕ капсом —
 * выводится капсом»), только источник данных другой: имя товара приходит НЕ из
 * поля панели, а из карточки товара в админке. Ровно поэтому старый сторож его
 * не видел: там перечислены блоки с текстовыми полями сайдбара, а «Товара» в
 * списке нет вовсе.
 *
 * ЗАМЕР «ДО» (живая цепочка, `render-theme-sections.mjs` с `live:true`,
 * имя «ТестОвый Товар», 2026-09-14):
 *   секция «Товар»       rose/vanilla/satin/bloom → КАПС на `<h1>`
 *                        (`ProductInfo.astro`, variant `uppercase-title`,
 *                         и он же вбит в `Product.astro`);
 *                        flux → чисто (оба дерева, desktop+mobile);
 *   карточка каталога    vanilla, satin → КАПС на ссылке с именем;
 *                        rose/flux/bloom → чисто;
 *   карточка «Коллекции  все пять → чисто.
 *   товаров»
 *
 * Границу берём ту же, что у старого сторожа: режем капс ТОЛЬКО там, где
 * печатаются ДАННЫЕ (имя товара). Собственные подписи темы («В корзину»,
 * «Скидка», «Количество», «Размер») капс сохраняют — их мерчант не вводит, и
 * они здесь намеренно не проверяются.
 *
 * Два пути рендера карточки, и меряются оба:
 *   • секция «Товар» и «Коллекции товаров» печатают имя в SSR-разметке →
 *     ищем маркер и поднимаемся по цепочке предков (text-transform
 *     наследуется, капс на любом предке — та же подмена);
 *   • карточка каталога рисуется клиентом из шаблона, который лежит строкой в
 *     инлайн-скрипте блока. Шаблон уезжает в браузер ровно таким — поэтому
 *     проверяем сам узел `<a …>${name}</a>` в отрендеренном артефакте, а не
 *     текст исходника.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
/** Каталог магазина для тем, которые ходят за товарами HTTP-запросом. */
const CATALOG_STUB = resolve(__dirname, "product-name-case-stub.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Смешанный регистр — ровно так имя заведено в админке. */
const NAME_MARK = "ТестОвый Товар";

/** Каталог для живой цепочки (rose/satin читают его из `__merfy.resolved`). */
const CATALOG = {
  collections: [
    {
      id: "col-1",
      name: "Хиты",
      slug: "hity",
      image: "/p1.png",
      productIds: ["p1", "p2", "p3", "p4"],
    },
  ],
  products: [1, 2, 3, 4].map((i) => ({
    id: `p${i}`,
    name: i === 1 ? NAME_MARK : `Товар ${i}`,
    slug: `tovar-${i}`,
    image: `/p${i}.png`,
    images: [`/p${i}.png`],
    price: 2500,
    basePrice: 2500,
    compareAtPrice: null,
    collectionIds: ["col-1"],
  })),
  publications: [],
};

const base = {
  siteId: "test-site",
  colorScheme: "scheme-1",
  padding: { top: 40, bottom: 40 },
};

const JOBS = [
  { block: "Product", props: { ...base, id: "Product-1", productId: "p1" } },
  {
    block: "PopularProducts",
    props: {
      ...base,
      id: "Pop-1",
      heading: "Популярное",
      cards: 4,
      columns: 4,
      collection: "col-1",
    },
  },
  { block: "Catalog", props: { ...base, id: "Cat-1" } },
] as const;

/** Самозакрывающиеся теги — в стек предков не кладутся. */
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

type Node = { tag: string; cls: string; style: string };

/**
 * Цепочка предков (включая сам узел) для каждого вхождения маркера В ТЕКСТЕ.
 * Разбор стеком тегов — как в `section-text-case.spec.ts`: готового DOM в jest
 * нет, а тянуть парсер ради одной проверки — лишняя зависимость.
 */
function ancestorsOf(html: string, marker: string): Node[][] {
  const hits: Node[][] = [];
  const stack: Node[] = [];
  const re = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [tag, name, attrs, textChunk] = m;
    if (textChunk !== undefined) {
      if (textChunk.includes(marker)) hits.push([...stack]);
      continue;
    }
    if (tag.startsWith("</")) {
      if (stack.length) stack.pop();
      continue;
    }
    // Маркер в атрибуте (alt, aria-label) — не текст узла, в стек не попадает.
    const cls = /class(?::list)?="([^"]*)"/.exec(attrs ?? "")?.[1] ?? "";
    const style = /style="([^"]*)"/.exec(attrs ?? "")?.[1] ?? "";
    if (!tag.endsWith("/>") && !VOID.has(name.toLowerCase())) {
      stack.push({ tag: name, cls, style });
    }
  }
  return hits;
}

const isUpper = (n: Node) =>
  /(^|\s)uppercase(\s|$)/.test(n.cls) ||
  /text-transform:\s*uppercase/i.test(n.style);

/** Цепочки, где капс навешен на сам узел или на любого предка. */
const capsedChains = (html: string, marker: string): string[] =>
  ancestorsOf(html, marker)
    .filter((chain) => chain.some(isUpper))
    .map((chain) =>
      chain
        .filter(isUpper)
        .map((n) => `<${n.tag}> ${n.cls || n.style}`)
        .join(" / "),
    );

/**
 * Узел имени товара в клиентском шаблоне карточки каталога.
 * Пять тем собирают его либо шаблонной строкой (`${name}`), либо конкатенацией
 * (`" + name + "`) — ловим оба вида.
 */
const catalogNameNodes = (html: string): string[] =>
  [
    ...html.matchAll(
      /<a[^>]*>\s*(?:\$\{name\}|"\s*\+\s*name\s*\+\s*")\s*<\/a>/g,
    ),
  ].map((m) => m[0]);

/** Только разметка, без инлайн-скриптов (для SSR-слоя). */
const markupOnly = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, "");

const built = (theme: Theme) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

/** Один прогон темы: все три блока живой цепочкой, со стабом каталога. */
function renderTheme(theme: Theme): Record<string, string | null> {
  const jobs = JOBS.map((j) => ({
    ...j,
    live: true,
    cascade: true,
    catalog: CATALOG,
  }));
  const raw = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify(jobs)],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const rows = JSON.parse(raw) as {
    block: string;
    html?: string;
    missing?: boolean;
    error?: string;
    pipelineError?: string;
  }[];
  const out: Record<string, string | null> = {};
  for (const r of rows) {
    if (r.html === undefined && !r.missing) {
      throw new Error(
        `рендер ${theme}/${r.block} не удался: ${r.error ?? r.pipelineError}`,
      );
    }
    out[r.block] = r.missing ? null : (r.html ?? "");
  }
  return out;
}

describe.each(THEMES)("название товара — %s", (theme) => {
  let rendered: Record<string, string | null>;

  beforeAll(() => {
    if (built(theme)) rendered = renderTheme(theme);
  }, 180_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built(theme)).toBe(true);
  });

  it("секция «Товар»: имя из админки есть в разметке", () => {
    // Держит проверку ниже от вырождения: «капса нет» ценно только тогда,
    // когда имя вообще напечатано.
    expect(markupOnly(rendered.Product ?? "")).toContain(NAME_MARK);
  });

  it("секция «Товар»: имя печатается без принудительного капса", () => {
    expect(capsedChains(markupOnly(rendered.Product ?? ""), NAME_MARK)).toEqual(
      [],
    );
  });

  it("секция «Товар»: регистр имени не переписан в тексте", () => {
    // Класс сняли — но текст мог бы прийти уже переведённым в верхний регистр
    // (toUpperCase в порте). Ищем точное вхождение, а не «похожее».
    expect(markupOnly(rendered.Product ?? "")).not.toContain(
      NAME_MARK.toUpperCase(),
    );
  });

  it("карточка каталога: узел имени в клиентском шаблоне найден", () => {
    const html = rendered.Catalog;
    if (html == null) return; // блока в теме нет
    expect(catalogNameNodes(html).length).toBeGreaterThan(0);
  });

  it("карточка каталога: имя печатается без принудительного капса", () => {
    const html = rendered.Catalog;
    if (html == null) return;
    const capsed = catalogNameNodes(html).filter((node) =>
      /(^|[\s"])uppercase([\s"])/.test(node),
    );
    expect(capsed).toEqual([]);
  });

  it("карточка «Коллекции товаров»: имя без капса (узость — не сломать)", () => {
    const html = rendered.PopularProducts;
    if (html == null) return;
    expect(markupOnly(html)).toContain(NAME_MARK);
    expect(capsedChains(markupOnly(html), NAME_MARK)).toEqual([]);
  });

  it("узость: подписи самой темы капс сохраняют", () => {
    // Правка режет капс у ДАННЫХ, а не «везде». Если кто-то причешет
    // типографику дальше и снимет капс с собственных подписей темы — падать
    // здесь, а не через день у тестировщика.
    const catalog = rendered.Catalog;
    if (catalog == null) return;
    expect(
      /text-transform:\s*uppercase|(^|\s|")uppercase(\s|"|$)/.test(catalog),
    ).toBe(true);
  });
});

// ───────────────────────────── саботаж детектора ─────────────────────────────

describe("саботаж: детектор капса не вырожден", () => {
  it("прежний `<h1>` секции «Товар» ловится", () => {
    const before =
      '<div class="flex flex-col gap-2 w-full" data-product-info>' +
      `<h1 class="[font-family:var(--font-heading)] leading-tight uppercase tracking-wide">${NAME_MARK}</h1></div>`;
    expect(capsedChains(before, NAME_MARK)).toHaveLength(1);
  });

  it("капс на ПРЕДКЕ ловится (text-transform наследуется)", () => {
    const before = `<div class="uppercase"><span><h1>${NAME_MARK}</h1></span></div>`;
    expect(capsedChains(before, NAME_MARK)).toHaveLength(1);
  });

  it("капс правилом в style= ловится", () => {
    const before = `<h1 style="text-transform: uppercase;">${NAME_MARK}</h1>`;
    expect(capsedChains(before, NAME_MARK)).toHaveLength(1);
  });

  it("прежний узел карточки каталога ловится", () => {
    const before =
      '<a href="${href}" class="font-manrope text-[16px] font-normal uppercase leading-tight">${name}</a>';
    expect(
      catalogNameNodes(before).filter((n) =>
        /(^|[\s"])uppercase([\s"])/.test(n),
      ),
    ).toHaveLength(1);
  });

  it("чистый узел карточки каталога капсом НЕ считается", () => {
    const ok =
      '<a href="${href}" class="rose-product-name block w-full font-manrope">${name}</a>';
    expect(
      catalogNameNodes(ok).filter((n) => /(^|[\s"])uppercase([\s"])/.test(n)),
    ).toEqual([]);
  });

  it("имя в alt/aria-label капсом не считается", () => {
    // Иначе сторож падал бы на `<img alt="ТестОвый Товар">` внутри
    // капсовой обёртки — там регистр читателю не виден вовсе.
    const html = `<div class="uppercase"><img alt="${NAME_MARK}" /></div>`;
    expect(capsedChains(html, NAME_MARK)).toEqual([]);
  });
});
