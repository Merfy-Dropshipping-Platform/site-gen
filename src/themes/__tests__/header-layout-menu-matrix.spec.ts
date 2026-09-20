import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Жалоба владельца 20.09: «при положении логотипа „По центру" ломается — все
 * иконки». Замер матрицей 5 тем × 4 положения логотипа × 3 типа меню показал
 * ровно две дырки, обе в сочетании «По центру» + «Боковое»:
 *
 *   flux     отступ иконок справа 498px вместо 80
 *   vanilla  отступ иконок справа 968px вместо 80
 *
 * Механизмы разные, симптом один. У flux «По центру» — сетка [1fr auto 1fr], а
 * «Боковое» прячет навигацию через display:none: элемент выпадает из сетки, и
 * логотип с иконками съезжают на колонку влево. У vanilla логотип абсолютный, в
 * потоке остаются меню и иконки, ряд раздаёт их justify-between — спрятали
 * меню, и единственный оставшийся блок прижался к левому краю.
 *
 * Инвариант, который здесь держится: ТИП МЕНЮ НЕ ДВИГАЕТ ПРАВЫЙ КРАЙ БЛОКА
 * ДЕЙСТВИЙ. Бургер входит в блок: при «Боковом» он законно встаёт правее
 * остальных иконок (у satin — левее), и без него замер ловил бы эту разницу как
 * поломку.
 * Он не зависит от конкретных чисел вёрстки каждой темы и поэтому переживает
 * правки дизайна — в отличие от «отступ равен 80px».
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;
const POSITIONS = ["top-left", "top-center", "center-left", "center-absolute"] as const;
const MENUS = ["dropdown", "mega-menu", "sidebar"] as const;

const LINKS = [
  { text: "Главная", href: "/" },
  { text: "Наушники", href: "/catalog" },
  { text: "Колонки", href: "/catalog" },
];

function renderHeader(theme: string, logoPosition: string, menuType: string): string {
  const props = {
    id: "Header-1",
    colorScheme: "1",
    logoPosition,
    menuType,
    navigationLinks: LINKS,
    links: LINKS,
  };
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}/${logoPosition}/${menuType}: ${res.error}`);
  return res.html ?? "";
}

/** Иконки подтягиваем данными, иначе file:// их не отдаёт и ширина будет нулевой. */
const ICON_DIRS = (theme: string) => [
  resolve(ROOT, "themes", theme, "public", "icons"),
  resolve(ROOT, "themes", "rose", "public", "icons"),
  resolve(ROOT, "themes", "satin", "public", "icons"),
  resolve(ROOT, "packages", "theme-base", "public", "icons"),
];

function inlineIcons(html: string, theme: string): string {
  return html.replace(/src="\/icons\/([^"]+)"/g, (whole, name: string) => {
    for (const dir of ICON_DIRS(theme)) {
      const file = resolve(dir, name);
      if (existsSync(file)) {
        return `src="data:image/svg+xml;base64,${readFileSync(file).toString("base64")}"`;
      }
    }
    return whole;
  });
}

type Page = {
  goto: (url: string, opts?: unknown) => Promise<unknown>;
  evaluate: <T>(fn: () => T) => Promise<T>;
  waitForTimeout: (ms: number) => Promise<void>;
};

let browser: { newPage: (o: unknown) => Promise<Page>; close: () => Promise<void> };
let page: Page;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { chromium } = require("playwright");
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 400 } });
}, 120000);

afterAll(async () => {
  if (browser) await browser.close();
});

async function actionsRightEdge(theme: string, pos: string, menu: string): Promise<number | null> {
  const css = readFileSync(resolve(ROOT, "dist", "theme-css", `${theme}.css`), "utf8");
  const html = inlineIcons(renderHeader(theme, pos, menu), theme);
  const file = `/tmp/header-matrix-${theme}-${pos}-${menu}.html`;
  writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><style>${css}</style><style>body{margin:0}</style>${html}`,
  );
  await page.goto(`file://${file}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const header = document.querySelector("header") ?? document.body.firstElementChild;
    if (!header) return null;
    const visible = (el: Element) =>
      (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().width > 0;
    const actions = [...header.querySelectorAll("a,button")].filter(
      (el) =>
        visible(el) &&
        /Поиск|Корзина|Аккаунт|Избранное|Меню/.test(el.getAttribute("aria-label") ?? ""),
    );
    if (!actions.length) return null;
    const right = Math.max(...actions.map((el) => el.getBoundingClientRect().right));
    return Math.round(header.getBoundingClientRect().right - right);
  });
}

describe("шапка: тип меню не двигает правый край блока иконок", () => {
  const cases: Array<[string, string]> = [];
  for (const theme of THEMES) for (const pos of POSITIONS) cases.push([theme, pos]);

  it.each(cases)(
    "%s / %s: «Выпадающее», «Расширенное» и «Боковое» дают один и тот же отступ справа",
    async (theme, pos) => {
      const base = await actionsRightEdge(theme, pos, "dropdown");
      expect(base).not.toBeNull();
      for (const menu of MENUS) {
        const got = await actionsRightEdge(theme, pos, menu);
        expect({ theme, pos, menu, отступСправа: got }).toEqual({
          theme,
          pos,
          menu,
          отступСправа: base,
        });
      }
    },
    180000,
  );
});
