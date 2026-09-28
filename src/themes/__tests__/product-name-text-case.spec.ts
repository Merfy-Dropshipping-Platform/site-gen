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
 *   • карточки каталога и избранного рисуются клиентом из шаблона, который
 *     лежит строкой в инлайн-скрипте блока. Шаблон уезжает в браузер ровно
 *     таким — поэтому проверяем сам узел `<a …>${name}</a>` в отрендеренном
 *     артефакте, а не текст исходника.
 *
 * Плюс отдельный слой по исходникам (в конце файла): копии и зеркала шаблона
 * карточки, которые рендер не видит, — капс в избранном satin жил именно там.
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
/** Каталог магазина для тем, которые ходят за товарами HTTP-запросом. */
const CATALOG_STUB = resolve(__dirname, "product-name-case-stub.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Смешанный регистр — ровно так имя заведено в админке. */
const NAME_MARK = "ТестОвый Товар";

/**
 * Заголовок секции «Каталог» — поле панели `categoryTitle` (aiText, вкладка
 * «Содержание»). Тот же смешанный регистр: мерчант пишет его руками.
 */
const HEADING_MARK = "КаталОг Мерчанта";

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
  {
    block: "Catalog",
    props: { ...base, id: "Cat-1", categoryTitle: HEADING_MARK },
  },
  // Карточка избранного — копия рецепта карточки каталога в инлайн-скрипте
  // страницы /wishlist. Товары она берёт клиентом, поэтому меряется так же,
  // как каталог: узел имени в шаблоне.
  { block: "WishlistSection", props: { ...base, id: "Wish-1" } },
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
 * Узел имени товара в клиентском шаблоне карточки (каталог, избранное).
 * Темы собирают его шаблонной строкой (`${name}`) или конкатенацией, причём
 * кавычки бывают любые: каталог пишет `" + name + "`, избранное —
 * `'…">' + name + "</a>"`. Ловим все виды: прежний шаблон знал только двойные
 * кавычки, и карточку избранного не увидел бы, даже будь она в списке блоков.
 */
const clientNameNodes = (html: string): string[] =>
  [
    ...html.matchAll(
      /<a[^>]*>\s*(?:\$\{name\}|["']\s*\+\s*name\s*\+\s*["'])\s*<\/a>/g,
    ),
  ].map((m) => m[0]);

/** Капс классом на узле шаблона (класс стоит в строке, отсюда кавычки в границах). */
const nodeHasCaps = (node: string) => /(^|[\s"'])uppercase([\s"'])/.test(node);

/** Только разметка, без инлайн-скриптов (для SSR-слоя). */
const markupOnly = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, "");

const built = (theme: Theme) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

/** Один прогон темы: все блоки JOBS живой цепочкой, со стабом каталога. */
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
    expect(clientNameNodes(html).length).toBeGreaterThan(0);
  });

  it("карточка каталога: имя печатается без принудительного капса", () => {
    const html = rendered.Catalog;
    if (html == null) return;
    expect(clientNameNodes(html).filter(nodeHasCaps)).toEqual([]);
  });

  it("карточка избранного: узел имени в клиентском шаблоне найден", () => {
    const html = rendered.WishlistSection;
    if (html == null) return; // блока в теме нет
    expect(clientNameNodes(html).length).toBeGreaterThan(0);
  });

  it("карточка избранного: имя печатается без принудительного капса", () => {
    const html = rendered.WishlistSection;
    if (html == null) return;
    expect(clientNameNodes(html).filter(nodeHasCaps)).toEqual([]);
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
    expect(clientNameNodes(before).filter(nodeHasCaps)).toHaveLength(1);
  });

  it("прежний узел карточки избранного satin (одинарные кавычки) ловится", () => {
    const before =
      "'<a href=\"' + href + '\" class=\"font-manrope text-[16px] font-normal uppercase leading-tight\">' + name + \"</a>\"";
    expect(clientNameNodes(before).filter(nodeHasCaps)).toHaveLength(1);
  });

  it("чистый узел карточки каталога капсом НЕ считается", () => {
    const ok =
      '<a href="${href}" class="rose-product-name block w-full font-manrope">${name}</a>';
    expect(clientNameNodes(ok).filter(nodeHasCaps)).toEqual([]);
  });

  it("ссылка-картинка с именем в aria-label узлом имени НЕ считается", () => {
    // Рядом с узлом имени в карточке стоит ссылка на фото: имя у неё только в
    // атрибуте, внутри — картинка. Её регистр читателю не виден.
    const media =
      "'<a href=\"' + href + '\" class=\"uppercase\" aria-label=\"' + name + '\">' + media + \"</a>\"";
    expect(clientNameNodes(media)).toEqual([]);
  });

  it("имя в alt/aria-label капсом не считается", () => {
    // Иначе сторож падал бы на `<img alt="ТестОвый Товар">` внутри
    // капсовой обёртки — там регистр читателю не виден вовсе.
    const html = `<div class="uppercase"><img alt="${NAME_MARK}" /></div>`;
    expect(capsedChains(html, NAME_MARK)).toEqual([]);
  });
});

// ───── слой 3: заголовок «Каталога» — та же болезнь, найдена попутно ─────

/**
 * `categoryTitle` — поле сайдбара, а не имя товара, поэтому формально это
 * другой баг. Но болезнь одна: тема переписывает регистр чужого текста.
 * Старый сторож `section-text-case.spec.ts` его не ловит — блока `Catalog`
 * нет в его списке JOBS вовсе (там 12 блоков, каталога среди них нет).
 *
 * ЗАМЕР «ДО» (2026-09-14): vanilla, flux, satin → КАПС на `<h1 id="catalog-title">`;
 * rose и bloom — чисто. То есть верхний регистр тут расхождение трёх путей из
 * пяти, а не решение дизайна (ровно та же картина, что была у выпадашек
 * вариантов: `product-variants-text-case.spec.ts`).
 */
describe.each(THEMES)("заголовок «Каталога» — %s", (theme) => {
  let html: string | null = null;

  beforeAll(() => {
    if (built(theme)) html = renderTheme(theme).Catalog;
  }, 180_000);

  it("заголовок мерчанта есть в разметке", () => {
    if (html == null) return; // блока в теме нет
    expect(markupOnly(html)).toContain(HEADING_MARK);
  });

  it("заголовок печатается без принудительного капса", () => {
    if (html == null) return;
    expect(capsedChains(markupOnly(html), HEADING_MARK)).toEqual([]);
  });

  it("регистр заголовка не переписан в тексте", () => {
    if (html == null) return;
    expect(markupOnly(html)).not.toContain(HEADING_MARK.toUpperCase());
  });
});

// ───── слой 4: исходники — копии и зеркала шаблона карточки ─────

/**
 * Рендер выше видит только блоки из JOBS. А шаблон карточки строкой живёт во
 * многих копиях: инлайн-скрипты каталога и избранного, тело корзины, зеркала
 * `storefront-hydrate.ts` (не исполняются, но с них копируют). Капс в
 * избранном satin приехал именно так: карточку избранного собрали из рецепта
 * каталога за 13 минут до того, как с каталога сняли капс, и правка прошла
 * мимо копии и мимо зеркала.
 *
 * Поэтому этот слой читает исходники пяти тем целиком и находит каждый узел,
 * который строковым шаблоном печатает имя из данных магазина: товар,
 * коллекция, группа вариантов, значение фильтра. Капс на самом узле — красный.
 * Капс на предке этот слой не видит, для этого есть рендер выше.
 */
const SOURCE_ROOTS = (theme: Theme) => [
  resolve(SITES_ROOT, "themes", theme, "src"),
  resolve(SITES_ROOT, "packages", `theme-${theme}`, "blocks"),
];

const isShippedSource = (file: string) =>
  /\.(astro|ts|js|mjs)$/.test(file) &&
  !/(^|\/)__tests__\//.test(file) &&
  !/\.(test|spec)\./.test(file);

const sourceFiles = (root: string): string[] =>
  existsSync(root)
    ? readdirSync(root, { recursive: true, encoding: "utf-8" })
        .filter(isShippedSource)
        .map((file) => resolve(root, file))
    : [];

/** Имя из данных: `name`, `p.name`, `line.name`, `escapeHtml(g.name)`, `productName`. */
const DATA_NAME = String.raw`(?:[\w$]+\()?(?:[\w$]+\.)?(?:name|productName)\)?`;

/** Узел, всё содержимое которого — имя: конкатенацией в любых кавычках или `${…}`. */
const TEMPLATE_NAME_NODE = new RegExp(
  String.raw`<(a|div|span|p|h[1-6]|strong|b)\b([^<>]*)>\s*(?:["']\s*\+\s*${DATA_NAME}\s*\+\s*["']|\$\{\s*${DATA_NAME}\s*\})\s*<\/\1>`,
  "g",
);

type SourceNode = { where: string; attrs: string };

const nodesIn = (file: string): SourceNode[] => {
  const src = readFileSync(file, "utf-8");
  return [...src.matchAll(TEMPLATE_NAME_NODE)].map((m) => ({
    where: `${relative(SITES_ROOT, file)}:${src.slice(0, m.index).split("\n").length}`,
    attrs: m[2],
  }));
};

const attrsHaveCaps = (attrs: string) =>
  nodeHasCaps(attrs) || /text-transform:\s*uppercase/i.test(attrs);

/** Карточки, которые видит покупатель: без них проход по исходникам пуст по смыслу. */
const CARD_TEMPLATES = ["Catalog.astro", "WishlistSection.astro", "CartBody.astro"];

describe.each(THEMES)("исходники %s: имя из данных магазина в шаблонах карточек", (theme) => {
  const nodes = SOURCE_ROOTS(theme).flatMap(sourceFiles).flatMap(nodesIn);

  it.each(CARD_TEMPLATES)("шаблон %s найден (проход не вырожден)", (file) => {
    expect(nodes.some((n) => n.where.includes(`/${file}:`))).toBe(true);
  });

  it("ни один узел не навязывает капс", () => {
    expect(nodes.filter((n) => attrsHaveCaps(n.attrs)).map((n) => n.where)).toEqual([]);
  });
});

describe("саботаж: проход по исходникам узнаёт прежние узлы", () => {
  const capsed = (src: string) =>
    [...src.matchAll(TEMPLATE_NAME_NODE)].filter((m) => attrsHaveCaps(m[2]));

  it("избранное satin: конкатенация в одинарных кавычках", () => {
    const before =
      "'<a href=\"' + href + '\" class=\"font-manrope font-normal uppercase leading-tight\">' + name + \"</a>\" +";
    expect(capsed(before)).toHaveLength(1);
  });

  it("зеркало каталога satin: шаблонная строка", () => {
    const before =
      '<a href="${href}" class="font-manrope font-normal uppercase leading-tight">${name}</a>';
    expect(capsed(before)).toHaveLength(1);
  });

  it("капс правилом в style= и имя через escapeHtml(line.name)", () => {
    const before =
      "'<div class=\"font-body\" style=\"font-size: 20px; text-transform: uppercase;\">' + escapeHtml(line.name) + '</div>'";
    expect(capsed(before)).toHaveLength(1);
  });

  it("подпись темы капсом узлом имени НЕ считается", () => {
    const own = '<span class="uppercase">Скидка</span>';
    expect([...own.matchAll(TEMPLATE_NAME_NODE)]).toEqual([]);
  });
});
