/**
 * Карточка товара внутри сетки «Коллекции товаров»: пропорции, стиль кнопки,
 * быстрое добавление. Пять тем.
 *
 * Баг-репорт тестировщика 13.09 (магазин 7b64b7a527d2, тема Rose):
 *
 *   K1. «Вид изображения» (Квадрат / Широкий / Портрет) не меняет пропорции
 *       карточки — все три значения давали одно и то же (318/444, натуральные
 *       пропорции файла). Причина оказалась двойной: override вешался на `<ul>`
 *       селектором `li>article>a`, которого в разметке нет (между `article` и
 *       `a` стоит `div` под overlay-сердце), а на самом `<a>` висел inline
 *       `aspect-ratio:318/444` — он бьёт любой класс. Правило в CSS при этом
 *       ИСПРАВНО генерировалось, так что «класса нет в бандле» — ложный след.
 *
 *   K3. «Быстрое добавление → Количество» рисовало обычную кнопку вместо
 *       счётчика: значение доезжало до разметки (`data-quick-add="cart"`),
 *       а степпер не рендерился.
 *
 *   K2. «Стиль кнопки → Широкий» — такой опции в поле нет вовсе (см. describe
 *       ниже). Гард держит состав опций, чтобы её не «починили» добавлением.
 *
 * Почему проверка считает пропорцию, а не ищет класс. «Вид изображения»
 * доезжает до карточки ТРЕМЯ разными механизмами, и они у тем разные:
 * inline-стиль (rose, bloom), arbitrary-variant на гриде (flux, satin) и
 * CSS-правило по `data-card-aspect` с `!important` (vanilla). Проверка вида
 * «в HTML есть aspect-[16/9]» зелёная на одной теме и слепа на остальных —
 * ровно в этой слепой зоне баг и прожил. Поэтому считается то же, что
 * показывает `getComputedStyle(...).aspectRatio`: ближайший к картинке предок
 * с ЗАДАННОЙ пропорцией и победитель каскада (см. card-aspect.ts).
 *
 * Резолвер откалиброван по настоящему Chromium: на 30 комбинациях
 * (5 тем × 3 значения «Вида изображения» + 5 тем × 3 режима быстрого
 * добавления) он даёт те же числа, что браузер. Калибровка прогонялась
 * вручную при написании проверки; расхождений нет.
 *
 * Требует собранных секций: pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ───────────────────────────────────────────────────────────────────────────
// Резолвер эффективной пропорции карточки (встроен сюда намеренно: jest
// считает тестом любой .ts внутри __tests__, поэтому отдельным файлом он
// падал бы как «сьют без тестов»; хелперы репозитория по той же причине —
// .mjs, но здесь нужны типы).
// ───────────────────────────────────────────────────────────────────────────

type Attrs = Record<string, string>;
type Node = { tag: string; attrs: Attrs; children: Node[]; parent: Node | null };

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
const ATTR_RE = /([\w:@.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/**
 * Astro отдаёт амперсанд в классе экранированным: вариант
 * `[&_li>article>a]:aspect-[16/9]` приезжает как `[&#38;_li>article>a]:...`.
 * Без разэкранирования вариант-классы не читаются вовсе — а это ровно тот
 * механизм, которым «Вид изображения» доезжает во flux и satin.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttrs(raw: string): Attrs {
  const out: Attrs = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw))) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** Мини-DOM: нам нужны только вложенность, теги и атрибуты. */
function parseHtml(html: string): Node {
  const root: Node = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html))) {
    const [, closing, rawTag, rawAttrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      for (let n: Node | null = cur; n && n !== root; n = n.parent) {
        if (n.tag === tag) { cur = n.parent ?? root; break; }
      }
      continue;
    }
    const node: Node = { tag, attrs: parseAttrs(rawAttrs), children: [], parent: cur };
    cur.children.push(node);
    if (!selfClose && !VOID_TAGS.has(tag)) cur = node;
  }
  return root;
}

function walk(node: Node, fn: (n: Node) => boolean | void): boolean {
  for (const child of node.children) {
    if (fn(child) === true) return true;
    if (walk(child, fn) === true) return true;
  }
  return false;
}

function find(root: Node, pred: (n: Node) => boolean): Node | null {
  let hit: Node | null = null;
  walk(root, (n) => { if (pred(n)) { hit = n; return true; } });
  return hit;
}

const classList = (n: Node) => (n.attrs.class ?? "").split(/\s+/).filter(Boolean);

/** `aspect-square` / `aspect-video` / `aspect-[430/500]` → «430/500». */
function aspectFromClass(cls: string): string | null {
  if (cls === "aspect-square") return "1/1";
  if (cls === "aspect-video") return "16/9";
  const m = /^aspect-\[([^\]]+)\]$/.exec(cls);
  return m ? m[1].replace(/_/g, " ") : null;
}

/** `aspect-ratio:16/9` из инлайн-стиля. */
function aspectFromStyle(style: string): string | null {
  const m = /aspect-ratio\s*:\s*([^;!]+)/i.exec(style);
  return m ? m[1].trim() : null;
}

/** Приводит «318 / 444», «16/9», «1 / 1» к числу — как считает браузер. */
function aspectToNumber(value: string): number | null {
  const m = /^\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*$/.exec(value);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = m[2] === undefined ? 1 : parseFloat(m[2]);
  return Number.isFinite(w) && Number.isFinite(h) && h !== 0 ? +(w / h).toFixed(3) : null;
}

/** Один компонент простого селектора: `div`, `.cls`, `[a=b]`, `:first-child`. */
function matchesCompound(node: Node, compound: string): boolean {
  const parts = compound.match(/^[a-zA-Z][\w-]*|\.[\w-]+|\[[^\]]+\]|:first-child|:last-child/g);
  if (!parts) return false;
  for (const part of parts) {
    if (part.startsWith(".")) {
      if (!classList(node).includes(part.slice(1))) return false;
    } else if (part.startsWith("[")) {
      const inner = part.slice(1, -1);
      const eq = inner.indexOf("=");
      if (eq === -1) {
        if (!(inner.toLowerCase() in node.attrs)) return false;
      } else {
        const name = inner.slice(0, eq).trim().toLowerCase();
        const want = inner.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (node.attrs[name] !== want) return false;
      }
    } else if (part === ":first-child") {
      if (node.parent?.children[0] !== node) return false;
    } else if (part === ":last-child") {
      if (node.parent?.children[node.parent.children.length - 1] !== node) return false;
    } else if (node.tag !== part.toLowerCase()) return false;
  }
  return true;
}

/**
 * Матчит сложный селектор (` ` и `>`) на узел, поднимаясь по предкам.
 * `stopAt` ограничивает подъём (для вариантов вида `[&_sel]` — рамкой самого
 * носителя класса, ровно как это делает `&` в сгенерированном CSS).
 */
function matchesSelector(node: Node, selector: string, stopAt: Node | null): boolean {
  const tokens = selector.trim().split(/\s*(>)\s*|\s+/).filter(Boolean);
  let cur: Node | null = node;
  let i = tokens.length - 1;
  if (i < 0 || !matchesCompound(cur, tokens[i])) return false;
  i -= 1;
  while (i >= 0) {
    const combinator = tokens[i] === ">" ? ">" : " ";
    if (combinator === ">") i -= 1;
    const compound = tokens[i];
    if (compound === undefined) return false;
    if (combinator === ">") {
      cur = cur.parent;
      if (!cur || cur === stopAt?.parent || !matchesCompound(cur, compound)) return false;
    } else {
      let found: Node | null = null;
      for (let a: Node | null = cur.parent; a && a !== stopAt?.parent; a = a.parent) {
        if (matchesCompound(a, compound)) { found = a; break; }
      }
      if (!found) return false;
      cur = found;
    }
    i -= 1;
  }
  return true;
}

type Rule = { selector: string; value: string; important: boolean };

/** Правила `aspect-ratio` из <style> секции (vanilla кладёт override туда). */
function collectStyleRules(html: string): Rule[] {
  const rules: Rule[] = [];
  for (const block of html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? []) {
    // Комментарии вырезаем ДО разбора: иначе текст пояснения прилипает к
    // следующему селектору, и правило перестаёт совпадать с разметкой.
    const css = block
      .replace(/<\/?style[^>]*>/gi, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /([^{}@]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const decl = /aspect-ratio\s*:\s*([^;}]+)/i.exec(m[2]);
      if (!decl) continue;
      const raw = decl[1].trim();
      const important = /!important/i.test(raw);
      for (const sel of m[1].split(",")) {
        const s = sel.trim();
        if (s && !s.startsWith("@")) {
          rules.push({ selector: s, value: raw.replace(/!important/i, "").trim(), important });
        }
      }
    }
  }
  return rules;
}

/**
 * Варианты Tailwind вида `[&_li>article>a]:aspect-[16/9]` на любом предке:
 * класс висит на гриде, а пропорцию получает потомок по вложенному селектору.
 */
function variantHits(node: Node, root: Node): { value: string; weight: number }[] {
  const hits: { value: string; weight: number }[] = [];
  for (let anc: Node | null = node; anc; anc = anc.parent) {
    for (const cls of classList(anc)) {
      const m = /^\[&(.+)\]:aspect-(\[[^\]]+\]|square|video)$/.exec(cls);
      if (!m) continue;
      const inner = m[1].replace(/^_/, "").replace(/_/g, " ");
      const value = aspectFromClass(`aspect-${m[2]}`);
      if (!value) continue;
      if (matchesSelector(node, inner, anc)) hits.push({ value, weight: 2 });
    }
    if (anc === root) break;
  }
  return hits;
}

type CardAspect = {
  /** Значение как его показывает браузер («16 / 9»-подобная строка). */
  value: string | null;
  /** Числовое отношение ширины к высоте. */
  ratio: number | null;
  /** Тег медиа-бокса — элемента, на котором пропорция реально сработала. */
  tag: string | null;
  /** Каким механизмом пропорция доехала. */
  via: "inline" | "class" | "variant" | "css" | null;
};

/**
 * Пропорция медиа-бокса первой карточки в сетке «Коллекции товаров».
 * Повторяет браузерную логику: ближайший к картинке предок с ЗАДАННОЙ
 * пропорцией, значение — победитель каскада.
 */
function effectiveCardAspect(html: string): CardAspect {
  const root = parseHtml(html);
  const grid =
    find(root, (n) => n.attrs["data-nt"] === "popular-grid") ??
    find(root, (n) => n.tag === "ul");
  if (!grid) return { value: null, ratio: null, tag: null, via: null };
  const li = find(grid, (n) => n.tag === "li");
  if (!li) return { value: null, ratio: null, tag: null, via: null };
  const img = find(li, (n) => n.tag === "img" || n.tag === "picture" || n.tag === "svg");
  if (!img) return { value: null, ratio: null, tag: null, via: null };

  const rules = collectStyleRules(html);

  for (let el: Node | null = img.parent; el && el !== li.parent; el = el.parent) {
    const candidates: { value: string; weight: number; via: CardAspect["via"] }[] = [];
    const inline = aspectFromStyle(el.attrs.style ?? "");
    if (inline) candidates.push({ value: inline, weight: 3, via: "inline" });
    for (const cls of classList(el)) {
      const v = aspectFromClass(cls);
      if (v) candidates.push({ value: v, weight: 1, via: "class" });
    }
    for (const hit of variantHits(el, grid)) {
      candidates.push({ value: hit.value, weight: hit.weight, via: "variant" });
    }
    for (const rule of rules) {
      if (matchesSelector(el, rule.selector, null)) {
        candidates.push({ value: rule.value, weight: rule.important ? 4 : 2, via: "css" });
      }
    }
    if (candidates.length === 0) continue;
    const winner = candidates.reduce((a, b) => (b.weight >= a.weight ? b : a));
    return {
      value: winner.value,
      ratio: aspectToNumber(winner.value),
      tag: el.tag,
      via: winner.via,
    };
  }
  return { value: null, ratio: null, tag: null, via: null };
}

/** Разметка быстрого добавления в первой карточке сетки. */
function quickAddShape(html: string): {
  gridMode: string | null;
  hasButton: boolean;
  buttonQuantity: string | null;
  stepper: { hasBox: boolean; hasInc: boolean; hasDec: boolean; hasQty: boolean };
} {
  const root = parseHtml(html);
  const grid =
    find(root, (n) => n.attrs["data-nt"] === "popular-grid") ??
    find(root, (n) => n.tag === "ul");
  const li = grid ? find(grid, (n) => n.tag === "li") : null;
  const has = (attr: string) => !!(li && find(li, (n) => attr in n.attrs));
  const button = li ? find(li, (n) => "data-add-to-cart" in n.attrs) : null;
  return {
    gridMode: grid?.attrs["data-quick-add"] ?? null,
    hasButton: !!button,
    buttonQuantity: button?.attrs["data-quantity"] ?? null,
    stepper: {
      hasBox: has("data-qa-stepper"),
      hasInc: has("data-qa-inc"),
      hasDec: has("data-qa-dec"),
      hasQty: has("data-qa-qty"),
    },
  };
}

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
/** Каталог магазина для тем, которые ходят за товарами HTTP-запросом. */
const CATALOG_STUB = resolve(__dirname, "storefront-data-stub.mjs");
const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/**
 * Пропорции «Вида изображения». Квадрат = 1:1 по Figma 648:57355 (image
 * 429×429) — не «пропорции файла верстальщика», их мерчант не выбирал.
 */
const IMAGE_VIEW: { value: string; label: string; aspect: string }[] = [
  { value: "square", label: "Квадрат", aspect: "1/1" },
  { value: "wide", label: "Широкий", aspect: "16/9" },
  { value: "portrait", label: "Портрет", aspect: "430/500" },
];

/** Каталог магазина: коллекция + товары, чтобы рисовались РЕАЛЬНЫЕ карточки. */
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
    name: `Товар ${i}`,
    slug: `tovar-${i}`,
    image: `/p${i}.png`,
    images: [`/p${i}.png`, `/p${i}-b.png`],
    price: 2500 + i * 100,
    basePrice: 2500 + i * 100,
    compareAtPrice: null,
    collectionIds: ["col-1"],
  })),
  publications: [],
};

const baseProps = {
  id: "Popular-1",
  siteId: "test-site",
  colorScheme: "1",
  heading: "Коллекция товаров",
  cards: 4,
  columns: 4,
  collection: "col-1",
  padding: { top: 40, bottom: 40 },
};

const built = (theme: Theme) =>
  existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));

/** Рендер секции портом темы — тем самым модулем, что уходит на витрину. */
function render(theme: Theme, props: Record<string, unknown>): string {
  const job = {
    block: "PopularProducts",
    props: { ...baseProps, ...props },
    live: true,
    catalog: CATALOG,
  };
  const raw = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify([job])],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const entry = JSON.parse(raw)[0] as {
    html?: string;
    error?: string;
    pipelineError?: string;
    missing?: boolean;
  };
  if (entry.html === undefined) {
    throw new Error(
      `рендер ${theme}/PopularProducts не удался: ${entry.error ?? entry.pipelineError ?? (entry.missing ? "блока нет в манифесте" : "?")}`,
    );
  }
  return entry.html;
}

const near = (a: number | null, b: number | null) =>
  a !== null && b !== null && Math.abs(a - b) < 0.01;

describe.each(THEMES)("«Вид изображения» меняет пропорции карточки (%s)", (theme) => {
  const html: Record<string, string> = {};

  beforeAll(() => {
    if (!built(theme)) return;
    for (const view of IMAGE_VIEW) html[view.value] = render(theme, { imageView: view.value });
  }, 180_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built(theme)).toBe(true);
  });

  for (const view of IMAGE_VIEW) {
    it(`«${view.label}» → карточка ${view.aspect}`, () => {
      if (!built(theme)) return;
      const got = effectiveCardAspect(html[view.value]);
      // Диагностика в сообщении: без неё падение выглядит как «ожидал 1, получил
      // 0.716» и не говорит, каким механизмом тема пропорцию (не) доставила.
      expect({
        пропорция: got.value,
        механизм: got.via,
        элемент: got.tag,
      }).toEqual({
        пропорция: expect.anything(),
        механизм: expect.anything(),
        элемент: expect.anything(),
      });
      expect(near(got.ratio, aspectToNumber(view.aspect))).toBe(true);
    });
  }

  it("три значения дают три РАЗНЫЕ пропорции, а не одну на всех", () => {
    if (!built(theme)) return;
    const ratios = IMAGE_VIEW.map((v) => effectiveCardAspect(html[v.value]).ratio);
    expect(new Set(ratios).size).toBe(3);
  });
});

describe.each(THEMES)("«Быстрое добавление → Количество» рисует счётчик (%s)", (theme) => {
  const html: Record<string, string> = {};

  beforeAll(() => {
    if (!built(theme)) return;
    for (const mode of ["none", "standard", "cart"]) {
      html[mode] = render(theme, { quickAddMode: mode });
    }
  }, 180_000);

  it("«Количество» → на карточке степпер − N +", () => {
    if (!built(theme)) return;
    const shape = quickAddShape(html.cart);
    expect({
      счётчик: shape.stepper.hasBox,
      минус: shape.stepper.hasDec,
      плюс: shape.stepper.hasInc,
      число: shape.stepper.hasQty,
    }).toEqual({ счётчик: true, минус: true, плюс: true, число: true });
  });

  it("«Количество» → кнопка несёт data-quantity (её правит счётчик, читает корзина)", () => {
    if (!built(theme)) return;
    const shape = quickAddShape(html.cart);
    expect(shape.hasButton).toBe(true);
    expect(shape.buttonQuantity).toBe("1");
  });

  it("«Стандарт» → одиночная кнопка, счётчика нет", () => {
    if (!built(theme)) return;
    const shape = quickAddShape(html.standard);
    expect(shape.hasButton).toBe(true);
    expect(shape.stepper.hasBox).toBe(false);
  });

  it("«Нет» → счётчика нет", () => {
    if (!built(theme)) return;
    expect(quickAddShape(html.none).stepper.hasBox).toBe(false);
  });

  it("клиентская гидрация получает режим с грида (переживает innerHTML)", () => {
    if (!built(theme)) return;
    expect(quickAddShape(html.cart).gridMode).toBe("cart");
  });
});

/**
 * K2. Тестировщик сообщил, что «Стиль кнопки → Широкий» даёт HTML, совпадающий
 * с «Дополнительной». Опции «Широкий» у этого поля нет и не было: в панели
 * ровно три значения — Ссылка / Основная / Дополнительная, а «Широкий»
 * принадлежит СОСЕДНЕМУ полю «Вид изображения». Дальше — гард состава: состав
 * параметров секций канон, и «починить» K2 добавлением четвёртой опции нельзя.
 */
describe.each(THEMES)("«Стиль кнопки» — состав опций (%s)", (theme) => {
  const blocksBuilt = existsSync(
    resolve(SITES_ROOT, "dist", "astro-blocks", "manifest.json"),
  );
  // Дамп канона отдаёт опции строками «значение=подпись».
  let fields: Record<string, { options?: string[] }> = {};

  beforeAll(() => {
    if (!blocksBuilt) return;
    const raw = execFileSync("node", [CANON_DUMP, "--theme", theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    });
    fields = JSON.parse(raw).themes[theme].PopularProducts.fields;
  }, 120_000);

  // Без собранных блоков проверки состава молча проходят и сторожат пустоту —
  // поэтому сборка требуется явно, а не «пропускается, если нет».
  it("блоки собраны (pnpm build && pnpm build:blocks)", () => {
    expect(blocksBuilt).toBe(true);
  });

  it("ровно три опции: Ссылка / Основная / Дополнительная", () => {
    if (!blocksBuilt) return;
    expect(fields.buttonStyle?.options).toEqual([
      "link=Ссылка",
      "primary=Основная",
      "secondary=Дополнительная",
    ]);
  });

  it("«Широкий» — это «Вид изображения», а не «Стиль кнопки»", () => {
    if (!blocksBuilt) return;
    // Тестировщик сообщил, что «Стиль кнопки → Широкий» повторяет
    // «Дополнительную». Такой опции у поля нет: «Широкий» — сосед из «Вида
    // изображения», и щёлкнут был он. Пока «Вид изображения» был мёртв, разметка
    // не менялась, и замер совпадал с предыдущим — отсюда и вывод про копию.
    expect(fields.buttonStyle?.options?.join(" ")).not.toContain("Широкий");
    expect(fields.imageView?.options).toContain("wide=Широкий");
  });
});

/**
 * Саботаж: проверки обязаны краснеть, когда механизм ломают. Без этого раздела
 * они могут быть зелёными по случайности — например, если резолвер перестанет
 * находить карточку и начнёт возвращать null на всё подряд.
 */
describe("саботаж — проверки ловят поломку", () => {
  const theme: Theme = "rose";
  const ok = () => built(theme);

  it("снятый inline aspect-ratio с карточки роняет K1", () => {
    if (!ok()) return;
    const html = render(theme, { imageView: "portrait" });
    expect(near(effectiveCardAspect(html).ratio, aspectToNumber("430/500"))).toBe(true);
    // Ровно та поломка, что была в проде: носитель пропорции убран с карточки.
    const sabotaged = html.replace(/style="aspect-ratio:[^"]*"/g, "");
    expect(near(effectiveCardAspect(sabotaged).ratio, aspectToNumber("430/500"))).toBe(false);
  });

  it("override, нацеленный мимо разметки, не засчитывается за рабочий", () => {
    if (!ok()) return;
    const html = render(theme, { imageView: "wide" });
    // Возвращаем прежнюю (мёртвую) схему: класс на гриде + селектор `li>article>a`,
    // которого в разметке нет, и inline-пропорция на карточке.
    const dead = html
      .replace(/style="aspect-ratio:[^"]*"/g, 'style="aspect-ratio:318/444"')
      .replace(
        /(<ul[^>]*?class=")/,
        '$1[&#38;_li>article>a]:aspect-[16/9] ',
      );
    expect(near(effectiveCardAspect(dead).ratio, aspectToNumber("16/9"))).toBe(false);
    expect(near(effectiveCardAspect(dead).ratio, aspectToNumber("318/444"))).toBe(true);
  });

  it("вырезанный счётчик роняет K3", () => {
    if (!ok()) return;
    const html = render(theme, { quickAddMode: "cart" });
    expect(quickAddShape(html).stepper.hasBox).toBe(true);
    const sabotaged = html.replace(/data-qa-stepper/g, "data-qa-removed");
    expect(quickAddShape(sabotaged).stepper.hasBox).toBe(false);
  });

  it("кнопка без data-quantity роняет K3 (корзина добавит 1 вместо выбранного)", () => {
    if (!ok()) return;
    const html = render(theme, { quickAddMode: "cart" });
    const sabotaged = html.replace(/data-quantity="1"/g, "");
    expect(quickAddShape(sabotaged).buttonQuantity).not.toBe("1");
  });
});
