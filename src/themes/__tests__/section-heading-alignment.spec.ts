/**
 * Заголовок секции и подзаголовок стоят на одной линии — замер в браузере.
 *
 * Владелец (скриншот bloom, «Коллекция товаров»): «тут у меня текст не прижат
 * к левому блоку». Заголовок «СЕЙЧАС В ТРЕНДЕ» и карточки начинались с одной
 * линии, подзаголовок — на 8px правее. Причина: bloom ставит заголовок этой
 * секции к левому краю (`blockDefaults.PopularProducts.headingAlignment`, поля
 * в панели нет), а заголовок темы `ui/BloomSectionHeading.astro` — разметка 1:1
 * с дизайн-системой, где заголовок по центру, — держит у подзаголовка `px-2`.
 * По центру отступ симметричен и не виден, у края он сдвигает текст.
 *
 * Мерим РЕЗУЛЬТАТ, а не классы: у каждой темы свой способ выравнивания
 * (text-align, items-*, свои обёртки). Линию берём из выравнивания, которое
 * браузер реально применил к заголовку:
 *   • к левому краю — левый край текста заголовка = подзаголовка = первой карточки;
 *   • по центру — центры заголовка и подзаголовка совпадают;
 *   • к правому краю — правые края заголовка и подзаголовка совпадают.
 *
 * Рисуем живой цепочкой (`live: true`: adaptLegacyProps → blockDefaults темы →
 * порт), как витрина и превью: выравнивание bloom приходит именно из
 * blockDefaults, прямой рендер порта его не увидел бы.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { chromium, type Browser } from "playwright";

import { renderSections, themeCss, tokensCssFor } from "../../../scripts/qa/lib";

const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
const WIDTHS = [390, 768, 1024, 1470, 1920] as const;

/** Допуск на округление субпикселей. */
const TOLERANCE_PX = 1;

const POPULAR = {
  id: "PopularProducts-1",
  heading: { text: "СЕЙЧАС В ТРЕНДЕ", size: "small" },
  text: { content: "Откройте для себя наши самые любимые средства", size: "small" },
  cards: 3,
};
const COLLECTIONS = {
  id: "Collections-1",
  heading: "Коллекции",
  subtitle: "Подборки магазина для замера подзаголовка",
};

type Theme = (typeof THEMES)[number];
type Case = { name: string; block: string; props: Record<string, unknown>; only?: Theme[] };

/**
 * Выравнивание заголовка у «Коллекции товаров» и «Коллекций» — скрытое поле: в
 * панели его нет, в магазин оно попадает только значением темы по умолчанию
 * (первая правка секции вписывает его в ревизию). Поэтому у всех тем меряем вид
 * по умолчанию — ровно то, что получает любой магазин, — а явные варианты берём
 * у секции из жалобы, где порт читает все три.
 *
 * У rose «Коллекции» с явным краем сдвигают подзаголовок так же (тот же `px-2` в
 * ui/RoseSectionHeading.astro), но rose такого значения не задаёт и в магазинах
 * его нет — записано в журнал тем, в эту правку не входит.
 */
const CASES: Case[] = [
  { name: "«Коллекция товаров», как в магазине владельца", block: "PopularProducts", props: POPULAR },
  { name: "«Коллекции» с подзаголовком", block: "Collections", props: COLLECTIONS },
  {
    name: "«Коллекция товаров», заголовок справа",
    block: "PopularProducts",
    props: { ...POPULAR, headingAlignment: "right" },
    only: ["bloom"],
  },
  {
    name: "«Коллекция товаров», заголовок по центру",
    block: "PopularProducts",
    props: { ...POPULAR, headingAlignment: "center" },
    only: ["bloom"],
  },
];

type Box = { left: number; right: number; align: string };
type Probe = { h2: Box | null; p: Box | null; cardLeft: number | null };

/**
 * Исполняется В БРАУЗЕРЕ. Строкой, а не функцией: трансформер тестов может
 * обернуть именованные функции помощником, которого в странице нет.
 * Края берём у ТЕКСТА (Range), а не у блока: отступ `px-2` живёт внутри блока.
 */
const PROBE = `(() => {
  const box = (el) => {
    if (!el) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
    if (!rects.length) return null;
    return {
      left: rects[0].left,
      right: Math.max(...rects.map((r) => r.right)),
      align: getComputedStyle(el).textAlign,
    };
  };
  const h2 = document.querySelector("h2");
  const p = h2 && h2.parentElement ? h2.parentElement.querySelector("p") : null;
  const card = document.querySelector("ul li, [role=list] > *");
  return { h2: box(h2), p: box(p), cardLeft: card ? card.getBoundingClientRect().left : null };
})()`;

/** К какому краю браузер выровнял заголовок. */
const EDGE: Record<string, "left" | "center" | "right"> = {
  left: "left",
  start: "left",
  center: "center",
  right: "right",
  end: "right",
};

const off = (a: number, b: number) => Math.abs(a - b) > TOLERANCE_PX;
const px = (n: number) => `${Math.round(n * 10) / 10}px`;

/** Расхождение линии заголовка и подзаголовка словами; null — стоят ровно. */
function misaligned(m: Probe): string | null {
  if (!m.h2 || !m.p) return "заголовок или подзаголовок не нарисован";
  const { h2, p } = m;
  const edge = EDGE[h2.align] ?? "left";
  const center = (b: Box) => (b.left + b.right) / 2;
  const RULES = {
    left: () =>
      off(h2.left, p.left)
        ? `подзаголовок с ${px(p.left)}, заголовок с ${px(h2.left)}`
        : m.cardLeft !== null && off(h2.left, m.cardLeft)
          ? `заголовок с ${px(h2.left)}, первая карточка с ${px(m.cardLeft)}`
          : null,
    center: () =>
      off(center(h2), center(p)) ? `центр подзаголовка ${px(center(p))}, заголовка ${px(center(h2))}` : null,
    right: () => (off(h2.right, p.right) ? `подзаголовок до ${px(p.right)}, заголовок до ${px(h2.right)}` : null),
  };
  const found = RULES[edge]();
  return found && `${edge}: ${found}`;
}

let shared: Browser | null = null;
async function browser(): Promise<Browser> {
  if (shared) return shared;
  shared = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  return shared;
}
afterAll(async () => {
  await shared?.close();
  shared = null;
});

const stripScripts = (html: string): string => html.replace(/<script\b[\s\S]*?<\/script>/gi, "");

async function measure(theme: string, html: string): Promise<{ width: number; m: Probe }[]> {
  const head = `<meta charset="utf-8"><style>${themeCss(theme)}</style><style id="__merfy_tokens_css">${tokensCssFor(theme)}</style>`;
  const ctx = await (await browser()).newContext({ viewport: { width: WIDTHS[0], height: 1400 } });
  const page = await ctx.newPage();
  await page.route("**/*", (route) =>
    /^(data:|about:)/.test(route.request().url()) ? route.continue() : route.abort(),
  );
  try {
    await page.setContent(
      `<!doctype html><html lang="ru"><head>${head}</head><body style="margin:0">${stripScripts(html)}</body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    const out: { width: number; m: Probe }[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1400 });
      out.push({ width, m: (await page.evaluate(PROBE)) as Probe });
    }
    return out;
  } finally {
    await ctx.close();
  }
}

describe("заголовок секции и подзаголовок на одной линии", () => {
  describe.each(THEMES)("%s", (theme) => {
    const cases = CASES.filter((c) => !c.only || c.only.includes(theme)).map((c) => [c.name, c.block, c.props] as const);
    it.each(cases)("%s", async (_name, block, props) => {
      const [row] = renderSections(theme, [{ block, props, live: true }]);
      if (!row?.html) throw new Error(`${theme}/${block}: ${row?.error ?? "нет html"}`);
      const got = await measure(theme, row.html);
      const bad = got.flatMap(({ width, m }) => {
        const why = misaligned(m);
        return why ? [`${width}px — ${why}`] : [];
      });
      expect(bad).toEqual([]);
    }, 120_000);
  });
});

describe("саботаж: замер видит сдвиг", () => {
  const page = async (html: string): Promise<Probe> => {
    const ctx = await (await browser()).newContext({ viewport: { width: 1024, height: 600 } });
    const p = await ctx.newPage();
    await p.setContent(`<!doctype html><html><body style="margin:0;padding:0 80px">${html}</body></html>`);
    const m = (await p.evaluate(PROBE)) as Probe;
    await ctx.close();
    return m;
  };

  it("подзаголовок с отступом 8px у левого края — ловится", async () => {
    const m = await page(
      `<div style="text-align:left"><h2>СЕЙЧАС В ТРЕНДЕ</h2><p style="padding:0 8px">Откройте для себя</p></div><ul style="margin:0;padding:0"><li>карточка</li></ul>`,
    );
    expect(misaligned(m)).toMatch(/^left: подзаголовок с 88px, заголовок с 80px/);
  });

  it("ровный левый край — не ловится", async () => {
    const m = await page(
      `<div style="text-align:left"><h2>СЕЙЧАС В ТРЕНДЕ</h2><p>Откройте для себя</p></div><ul style="margin:0;padding:0"><li>карточка</li></ul>`,
    );
    expect(misaligned(m)).toBeNull();
  });

  it("по центру симметричный отступ не мешает, несимметричный — ловится", async () => {
    const sym = await page(`<div style="text-align:center"><h2>Заголовок</h2><p style="padding:0 8px">Подзаголовок</p></div>`);
    const asym = await page(`<div style="text-align:center"><h2>Заголовок</h2><p style="padding-left:16px">Подзаголовок</p></div>`);
    expect(misaligned(sym)).toBeNull();
    expect(misaligned(asym)).toMatch(/^center:/);
  });

  it("у правого края отступ подзаголовка — ловится", async () => {
    const m = await page(`<div style="text-align:right"><h2>Заголовок</h2><p style="padding:0 8px">Подзаголовок</p></div>`);
    expect(misaligned(m)).toMatch(/^right:/);
  });
});
