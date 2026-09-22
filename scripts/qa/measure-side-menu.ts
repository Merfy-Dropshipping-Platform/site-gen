/**
 * Замер бокового меню («Тип меню» = «Боковое») глазами человека: живой порт
 * шапки каждой темы в Chromium, настоящие нажатия мышью в точку на экране.
 *
 * Документ владельца «Merfy — баги бокового меню» (22.09): панель со смещением,
 * две шапки одна поверх другой, панель под верхним меню, не скроллится, в шапке
 * панели сердце рядом с корзиной, нажатие на стрелку закрывает меню.
 *
 * Статический разбор разметки (scripts/scan-header-menu.mjs) этого не видит:
 * всё перечисленное — про то, ЧТО ЛЕЖИТ СВЕРХУ и КУДА УХОДИТ НАЖАТИЕ, а это
 * знает только браузер. Поэтому нажатия — `page.mouse.click` в координату, а не
 * `el.click()`: клик в DOM попадает в элемент, даже если поверх него лежит
 * чужая шапка, и баг «нажал на стрелку — меню закрылось» им не воспроизвести.
 *
 * Запуск (после pnpm build, build:blocks, build:theme-sections:all):
 *   pnpm qa:side-menu                                   — правила, код 1 при нарушении
 *   pnpm tsx scripts/qa/measure-side-menu.ts            — таблица чисел по клеткам
 *   pnpm tsx scripts/qa/measure-side-menu.ts --json     — сырые числа
 *   … --theme=bloom --sc=телефон --shots=<папка>        — одна тема/сценарий, снимки
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { chromium, type Browser, type Page } from "playwright";

import { renderBlock } from "./lib/render";
import { loadTesterSchemes, tokensCssFor } from "./lib/schemes";
import { themeCss } from "./lib/tailwind-css";

export const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;

const MANY = Array.from({ length: 22 }, (_, i) => ({ label: `Пункт ${i + 1}`, href: `/p${i + 1}` }));
export const NAV = [
  {
    label: "Каталог",
    href: "/catalog",
    submenu: [
      { label: "Наушники", href: "/catalog", submenu: [{ label: "TWS", href: "/catalog" }] },
      { label: "Колонки", href: "/catalog" },
    ],
  },
  { label: "О нас", href: "/about" },
  ...MANY,
];

export type Scenario = {
  id: string;
  width: number;
  height: number;
  stickiness: "none" | "always" | "scroll-up";
  /** Дёрнуть размер окна до открытия (адресная строка телефона, смена ширины в конструкторе). */
  resizeBeforeOpen?: boolean;
  /** Прокрутить страницу перед открытием. */
  scrollBeforeOpen?: number;
};

export const SCENARIOS: Scenario[] = [
  { id: "телефон", width: 375, height: 812, stickiness: "none" },
  { id: "телефон+ресайз", width: 375, height: 812, stickiness: "none", resizeBeforeOpen: true },
  { id: "телефон+scroll-up", width: 375, height: 812, stickiness: "scroll-up", scrollBeforeOpen: 300 },
  { id: "телефон+always", width: 375, height: 812, stickiness: "always", scrollBeforeOpen: 300 },
  { id: "десктоп", width: 1440, height: 900, stickiness: "none" },
  { id: "десктоп+ресайз", width: 1440, height: 900, stickiness: "none", resizeBeforeOpen: true },
  { id: "десктоп+always", width: 1440, height: 900, stickiness: "always", scrollBeforeOpen: 300 },
  { id: "десктоп+scroll-up", width: 1440, height: 900, stickiness: "scroll-up", scrollBeforeOpen: 300 },
];

function headerHtml(theme: string, sc: Scenario): string {
  return renderBlock(theme, "Header", {
    id: "Header-1",
    colorScheme: "scheme-1",
    menuColorScheme: "scheme-3",
    menuType: "sidebar",
    logoPosition: "center-left",
    stickiness: sc.stickiness,
    siteTitle: "МАГАЗИН",
    promoBar: { enabled: true, text: "Скидка 10% на заказ", linkText: "Перейти", linkHref: "/" },
    navigationLinks: NAV,
    links: NAV,
  });
}

function pageOf(theme: string, header: string): string {
  const tokens = tokensCssFor(theme, loadTesterSchemes());
  // Страница выше экрана: без этого «страница не скроллится» не проверить.
  const filler = Array.from(
    { length: 12 },
    (_, i) =>
      `<section data-filler style="height:300px;background:hsl(${i * 30} 60% 60%);display:flex;align-items:center;justify-content:center;font:20px sans-serif">секция ${i + 1}</section>`,
  ).join("");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${themeCss(theme)}</style>
<style id="__merfy_tokens_css">${tokens}</style>
<style>html,body{margin:0;padding:0}</style>
</head><body><div class="color-scheme-1" style="display:contents" data-block-scheme="1">${header}</div><main>${filler}</main></body></html>`;
}

function serve(html: string): Promise<{ base: string; server: Server }> {
  const server = createServer((req, res) => {
    if ((req.url ?? "") === "/" || (req.url ?? "").startsWith("/?")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    // Любой другой адрес — «чужая страница»: так видно, что нажатие увело.
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>ушли</title><body data-navigated="${req.url}">ушли на ${req.url}</body>`);
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      done({ base: `http://127.0.0.1:${port}`, server });
    });
  });
}

/**
 * Запись кадров: на каждый requestAnimationFrame — левый край панели (null, если
 * панель не отрисована). Левый край двигает и translate, поэтому по нему видно
 * выезд. 700 мс хватает на любую разумную анимацию.
 */
async function startFrames(page: Page, sel: string): Promise<void> {
  await page.evaluate((s) => {
    const d = document.querySelector(s) as HTMLElement;
    const w = window as any;
    w.__frames = [];
    const t0 = performance.now();
    const tick = () => {
      const shown = getComputedStyle(d).display !== "none";
      w.__frames.push([Math.round(performance.now() - t0), shown ? Math.round(d.getBoundingClientRect().left * 10) / 10 : null]);
      if (performance.now() - t0 < 700) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, sel);
}

function summarizeOpen(frames: Array<[number, number | null]>) {
  const shown = frames.filter((f) => f[1] !== null) as Array<[number, number]>;
  if (!shown.length) return { steps: 0, backwards: 0, settledMs: null, flash: false };
  const final = shown[shown.length - 1][1];
  const first = shown[0][1];
  // Мигание: панель отрисовалась, пропала и отрисовалась снова.
  const firstShownIdx = frames.findIndex((f) => f[1] !== null);
  const flash = frames.slice(firstShownIdx).some((f) => f[1] === null);
  const between = new Set(shown.map((f) => f[1]).filter((x) => x !== final && x !== first));
  let backwards = 0;
  for (let i = 1; i < shown.length; i++) {
    const dir = Math.sign(final - first);
    if (dir && Math.sign(shown[i][1] - shown[i - 1][1]) === -dir) backwards++;
  }
  const settled = shown.find((f) => f[1] === final);
  return { steps: between.size, backwards, settledMs: settled ? settled[0] : null, flash };
}

function summarizeClose(frames: Array<[number, number | null]>) {
  const shown = frames.filter((f) => f[1] !== null) as Array<[number, number]>;
  const goneIdx = frames.findIndex((f) => f[1] === null);
  const flash = goneIdx >= 0 && frames.slice(goneIdx).some((f) => f[1] !== null);
  if (!shown.length) return { steps: 0, backwards: 0, goneMs: goneIdx >= 0 ? frames[goneIdx][0] : null, flash, hiddenBeforeOut: true };
  const start = shown[0][1];
  const last = shown[shown.length - 1][1];
  const between = new Set(shown.map((f) => f[1]).filter((x) => x !== start));
  let backwards = 0;
  for (let i = 1; i < shown.length; i++) {
    const dir = Math.sign(last - start);
    if (dir && Math.sign(shown[i][1] - shown[i - 1][1]) === -dir) backwards++;
  }
  // Панель исчезла, не уехав: последний отрисованный кадр ещё на месте.
  const hiddenBeforeOut = Math.abs(last - start) < 2;
  return { steps: between.size, backwards, goneMs: goneIdx >= 0 ? frames[goneIdx][0] : null, flash, hiddenBeforeOut };
}

/** Центр ВИДИМОГО элемента, который первым подходит под селектор. */
async function visibleCenter(page: Page, selector: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((sel) => {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, selector);
}

export type Measure = {
  theme: string;
  scenario: string;
  opened: boolean;
  /** Прямоугольник панели против окна. */
  rect: { x: number; y: number; w: number; h: number } | null;
  viewport: { w: number; h: number };
  /** Доля точек поверх панели, где сверху лежит НЕ панель (чужая шапка и т.п.). */
  coveredShare: number;
  /** Видимые сверху на экране: кнопки меню/закрытия, корзины, сердца, логотипы. */
  topmost: { burgerOrClose: number; cart: number; wishlist: number; logo: number };
  /** Из них — НЕ из панели (шапка страницы поверх или рядом). */
  topmostOutside: { burgerOrClose: number; cart: number; wishlist: number; logo: number };
  /** Иконки в шапке самой панели. */
  inPanel: { cart: number; wishlist: number; close: number };
  /** Отступ первого пункта от верха панели. */
  firstItemOffset: number | null;
  /** Верх корня шапки: до открытия, после открытия и после колеса над панелью. */
  headerTop: { before: number | null; open: number | null; afterWheel: number | null };
  /** Скролл: колесо над панелью. */
  scroll: { panelBefore: number; panelAfter: number; pageBefore: number; pageAfter: number; panelScrollable: boolean };
  /** Стрелка у пункта с вложенностью: нажатие мышью в стрелку. */
  arrow: {
    found: boolean;
    menuOpenAfter: boolean;
    subOpenAfter: boolean;
    navigated: string | null;
    arrowsOnPlainItems: number;
  };
  /**
   * Анимация (документ «баги пунктов меню», баг 1): положение панели по кадрам
   * после нажатия. `steps` — сколько РАЗНЫХ промежуточных положений между краем
   * и местом, `backwards` — откаты назад (дёрганье), `settledMs` — когда встала,
   * `flash` — панель пропала и появилась снова (мигание).
   */
  anim: {
    open: { steps: number; backwards: number; settledMs: number | null; flash: boolean };
    close: { steps: number; backwards: number; goneMs: number | null; flash: boolean; hiddenBeforeOut: boolean };
    /** Сдвиг содержимого страницы при открытии, px (полоса прокрутки и т.п.). */
    pageShift: number;
  };
  notes: string[];
};

const SHOTS = process.argv.find((a) => a.startsWith("--shots="))?.slice(8) ?? null;

async function measureOne(browser: Browser, theme: string, sc: Scenario): Promise<Measure> {
  const html = pageOf(theme, headerHtml(theme, sc));
  const { base, server } = await serve(html);
  const ctx = await browser.newContext({ viewport: { width: sc.width, height: sc.height } });
  const page = await ctx.newPage();
  // tsx оборачивает функции в `__name(...)`; в браузере его нет (ловушка из scripts/qa/lib/stage.ts).
  await page.addInitScript("globalThis.__name = globalThis.__name || function (f) { return f; };");
  await page.route("**/*", (route) => {
    const u = route.request().url();
    return /^(data:|about:|blob:)/.test(u) || u.startsWith(base) ? route.continue() : route.abort();
  });
  const notes: string[] = [];
  const blank: Measure = {
    theme,
    scenario: sc.id,
    opened: false,
    rect: null,
    viewport: { w: sc.width, h: sc.height },
    coveredShare: 0,
    topmost: { burgerOrClose: 0, cart: 0, wishlist: 0, logo: 0 },
    topmostOutside: { burgerOrClose: 0, cart: 0, wishlist: 0, logo: 0 },
    inPanel: { cart: 0, wishlist: 0, close: 0 },
    firstItemOffset: null,
    headerTop: { before: null, open: null, afterWheel: null },
    scroll: { panelBefore: 0, panelAfter: 0, pageBefore: 0, pageAfter: 0, panelScrollable: false },
    arrow: { found: false, menuOpenAfter: false, subOpenAfter: false, navigated: null, arrowsOnPlainItems: 0 },
    anim: {
      open: { steps: 0, backwards: 0, settledMs: null, flash: false },
      close: { steps: 0, backwards: 0, goneMs: null, flash: false, hiddenBeforeOut: false },
      pageShift: 0,
    },
    notes,
  };
  try {
    await page.goto(base, { waitUntil: "load" });
    await page.waitForTimeout(150);
    if (sc.resizeBeforeOpen) {
      await page.setViewportSize({ width: sc.width, height: sc.height - 120 });
      await page.waitForTimeout(80);
      await page.setViewportSize({ width: sc.width, height: sc.height });
      await page.waitForTimeout(80);
    }
    if (sc.scrollBeforeOpen) {
      await page.mouse.move(sc.width / 2, sc.height / 2);
      await page.mouse.wheel(0, sc.scrollBeforeOpen);
      await page.waitForTimeout(200);
      // Немного вверх — scroll-up шапка возвращается.
      await page.mouse.wheel(0, -60);
      await page.waitForTimeout(400);
    }
    const drawerSel = `#${theme}-burger`;
    const headerTop = () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-puck-component-id="Header-1"]');
        return root ? Math.round(root.getBoundingClientRect().top) : null;
      });
    blank.headerTop.before = await headerTop();
    const toggle = await visibleCenter(page, "[data-burger-toggle]:not([data-burger-close])");
    if (!toggle) {
      notes.push("видимой кнопки меню нет");
      return blank;
    }
    const pageLeftBefore = await page.evaluate(() => document.querySelector("[data-filler]")?.getBoundingClientRect().left ?? 0);
    await startFrames(page, drawerSel);
    await page.mouse.click(toggle.x, toggle.y);
    await page.waitForTimeout(800);
    const openFrames = await page.evaluate(() => (window as any).__frames as Array<[number, number | null]>);
    blank.anim.pageShift = Math.round(
      ((await page.evaluate(() => document.querySelector("[data-filler]")?.getBoundingClientRect().left ?? 0)) - pageLeftBefore) * 10,
    ) / 10;
    blank.headerTop.open = await headerTop();

    const m = await page.evaluate((sel) => {
      const d = document.querySelector(sel) as HTMLElement | null;
      if (!d) return null;
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      const opened = cs.display !== "none" && r.width > 10 && r.height > 10;
      const vis = (el: Element) => {
        const b = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return b.width > 1 && b.height > 1 && s.visibility !== "hidden" && s.display !== "none" && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
      };
      const onTop = (el: Element) => {
        if (!vis(el)) return false;
        const b = el.getBoundingClientRect();
        const cx = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1);
        const cy = Math.min(Math.max(b.top + b.height / 2, 0), innerHeight - 1);
        const hit = document.elementFromPoint(cx, cy);
        return !!hit && (hit === el || el.contains(hit));
      };
      const count = (s: string) => Array.from(document.querySelectorAll(s)).filter(onTop).length;
      const countOut = (s: string) => Array.from(document.querySelectorAll(s)).filter((el) => !d.contains(el)).filter(onTop).length;
      const CART = '[data-cart-open], a[href="/cart"]';
      // Сетка точек по видимой части панели: кто лежит сверху.
      let total = 0;
      let covered = 0;
      const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, innerWidth);
      const y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, innerHeight);
      for (let i = 1; i < 8; i++) {
        for (let j = 1; j < 16; j++) {
          const x = x0 + ((x1 - x0) * i) / 8;
          const y = y0 + ((y1 - y0) * j) / 16;
          const hit = document.elementFromPoint(x, y);
          total++;
          if (!hit || !d.contains(hit)) covered++;
        }
      }
      const nav = d.querySelector("[data-nav-drawer]");
      const first = nav ? (Array.from(nav.querySelectorAll("a[href], [data-nav-sub-toggle]")).find(vis) as Element | undefined) : undefined;
      const inPanel = (s: string) => Array.from(d.querySelectorAll(s)).filter(vis).length;
      return {
        opened,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        viewport: { w: innerWidth, h: innerHeight },
        coveredShare: total ? covered / total : 0,
        topmost: {
          burgerOrClose: count("[data-burger-toggle]"),
          cart: count(CART),
          wishlist: count('a[href="/wishlist"]'),
          logo: count('a[href="/"]'),
        },
        topmostOutside: {
          burgerOrClose: countOut("[data-burger-toggle]"),
          cart: countOut(CART),
          wishlist: countOut('a[href="/wishlist"]'),
          logo: countOut('a[href="/"]'),
        },
        inPanel: {
          cart: inPanel(CART),
          wishlist: inPanel('a[href="/wishlist"]'),
          close: inPanel("[data-burger-close], [data-burger-toggle]"),
        },
        firstItemOffset: first ? Math.round(first.getBoundingClientRect().top - r.top) : null,
        panelScrollable: d.scrollHeight > d.clientHeight + 1,
      };
    }, drawerSel);
    if (!m) {
      notes.push("панели нет в разметке");
      return blank;
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${theme}-${sc.id}-open.png` });
    Object.assign(blank, {
      opened: m.opened,
      rect: m.rect,
      viewport: m.viewport,
      coveredShare: Math.round(m.coveredShare * 100) / 100,
      topmost: m.topmost,
      topmostOutside: m.topmostOutside,
      inPanel: m.inPanel,
      firstItemOffset: m.firstItemOffset,
    });
    if (!m.opened) {
      notes.push("панель не открылась");
      return blank;
    }

    // Скролл колесом над серединой видимой части панели.
    const cx = Math.max(m.rect.x, 0) + (Math.min(m.rect.x + m.rect.w, sc.width) - Math.max(m.rect.x, 0)) / 2;
    const cy = Math.max(m.rect.y, 0) + (Math.min(m.rect.y + m.rect.h, sc.height) - Math.max(m.rect.y, 0)) / 2;
    const before = await page.evaluate((sel) => ({
      panel: (document.querySelector(sel) as HTMLElement).scrollTop,
      page: document.scrollingElement?.scrollTop ?? 0,
    }), drawerSel);
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(250);
    }
    // Колесо над открытой частью страницы (слева от панели), если она есть.
    if (m.rect.x > 40) {
      await page.mouse.move(Math.max(m.rect.x / 2, 5), sc.height / 2);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(250);
    }
    blank.headerTop.afterWheel = await headerTop();
    const after = await page.evaluate((sel) => ({
      panel: (document.querySelector(sel) as HTMLElement).scrollTop,
      page: document.scrollingElement?.scrollTop ?? 0,
    }), drawerSel);
    blank.scroll = {
      panelBefore: Math.round(before.panel),
      panelAfter: Math.round(after.panel),
      pageBefore: Math.round(before.page),
      pageAfter: Math.round(after.page),
      panelScrollable: m.panelScrollable,
    };
    // Вернуть панель наверх для проверки стрелки.
    await page.evaluate((sel) => {
      (document.querySelector(sel) as HTMLElement).scrollTop = 0;
    }, drawerSel);
    await page.waitForTimeout(100);

    // Стрелка у «Каталог»: нажатие мышью ровно в стрелку.
    const arrowPoint = await page.evaluate((sel) => {
      const d = document.querySelector(sel) as HTMLElement;
      const rows = Array.from(d.querySelectorAll("[data-nav-sub-toggle]"));
      const row = rows.find((el) => (el.textContent || "").trim().startsWith("Каталог")) ?? null;
      // Стрелки у пунктов БЕЗ вложенных: svg/img в строке обычного пункта.
      const nav = d.querySelector("[data-nav-drawer]");
      let plainArrows = 0;
      if (nav) {
        for (const a of Array.from(nav.querySelectorAll("a[href]"))) {
          const label = (a.textContent || "").trim();
          if (!/^Пункт \d+$|^О нас$/.test(label)) continue;
          const holder = a.parentElement as HTMLElement;
          plainArrows += holder.querySelectorAll(":scope > svg, :scope > button svg, :scope > img").length;
          plainArrows += a.querySelectorAll("svg, img").length;
        }
      }
      if (!row) return { found: false, plainArrows };
      const glyph = row.querySelector("svg, img") ?? row;
      const b = glyph.getBoundingClientRect();
      return { found: true, x: b.left + b.width / 2, y: b.top + b.height / 2, plainArrows };
    }, drawerSel);
    blank.arrow.arrowsOnPlainItems = arrowPoint.plainArrows;
    if (arrowPoint.found && "x" in arrowPoint) {
      blank.arrow.found = true;
      await page.mouse.click(arrowPoint.x as number, arrowPoint.y as number);
      await page.waitForTimeout(400);
      const res = await page.evaluate((sel) => {
        const nav = document.body.getAttribute("data-navigated");
        const d = document.querySelector(sel) as HTMLElement | null;
        if (!d) return { nav, open: false, sub: false };
        const open = getComputedStyle(d).display !== "none" && d.getBoundingClientRect().height > 10;
        const row = Array.from(d.querySelectorAll("[data-nav-sub-toggle]")).find((el) =>
          (el.textContent || "").trim().startsWith("Каталог"),
        );
        const group = row?.closest("[data-nav-group]");
        const sub = group?.querySelector(":scope > [data-nav-sub]") as HTMLElement | null;
        const subOpen = !!sub && !sub.hasAttribute("hidden") && sub.getBoundingClientRect().height > 1;
        return { nav, open, sub: subOpen };
      }, drawerSel);
      blank.arrow.menuOpenAfter = res.open;
      blank.arrow.subOpenAfter = res.sub;
      blank.arrow.navigated = res.nav;
    }
    Object.assign(blank.anim.open, summarizeOpen(openFrames));

    // Закрытие: крестик в шапке панели, запись кадров.
    await page.evaluate((sel) => {
      (document.querySelector(sel) as HTMLElement).scrollTop = 0;
    }, drawerSel);
    const close = await visibleCenter(page, `${drawerSel} [data-burger-close]`);
    if (close && !blank.arrow.navigated) {
      await page.mouse.move(close.x, close.y);
      await page.waitForTimeout(150);
      await startFrames(page, drawerSel);
      await page.mouse.click(close.x, close.y);
      await page.waitForTimeout(800);
      const closeFrames = await page.evaluate(() => (window as any).__frames as Array<[number, number | null]>);
      Object.assign(blank.anim.close, summarizeClose(closeFrames));
    } else {
      notes.push("крестика в панели не видно — закрытие не записано");
    }
    return blank;
  } finally {
    await ctx.close();
    server.close();
  }
}

/**
 * ПРАВИЛА — дословно то, что ждёт тестировщик (документ «баги бокового меню»).
 * Каждое возвращает null (выполнено) или текст нарушения.
 */
export const RULES: Array<{ id: string; bug: string; title: string; check: (m: Measure, sc: Scenario) => string | null }> = [
  {
    id: "открывается",
    bug: "—",
    title: "панель открывается кнопкой меню",
    check: (m) => (m.opened ? null : `не открылась${m.notes.length ? ` (${m.notes.join("; ")})` : ""}`),
  },
  {
    id: "во-весь-экран",
    bug: "1",
    title: "на телефоне панель занимает экран целиком",
    check: (m, sc) => {
      if (!m.rect || sc.width >= 768) return null;
      const r = m.rect;
      const ok = Math.abs(r.x) <= 1 && Math.abs(r.y) <= 1 && Math.abs(r.w - m.viewport.w) <= 1 && Math.abs(r.h - m.viewport.h) <= 1;
      return ok ? null : `панель ${r.x},${r.y} ${r.w}×${r.h} при окне ${m.viewport.w}×${m.viewport.h}`;
    },
  },
  {
    id: "от-верха",
    bug: "5",
    title: "панель открывается от верха экрана, а не под верхним меню",
    check: (m) => (!m.rect ? null : m.rect.y === 0 && Math.abs(m.rect.y + m.rect.h - m.viewport.h) <= 1 ? null : `верх панели ${m.rect.y}px, низ ${m.rect.y + m.rect.h} при окне ${m.viewport.h}`),
  },
  {
    id: "одна-шапка",
    bug: "1, 3",
    title: "одна шапка: поверх панели ничего не лежит, на телефоне шапка страницы не видна",
    check: (m, sc) => {
      if (!m.opened) return null;
      if (m.coveredShare > 0) return `панель накрыта чужим на ${Math.round(m.coveredShare * 100)}% точек`;
      if (sc.width < 768) {
        const o = m.topmostOutside;
        const n = o.burgerOrClose + o.cart + o.wishlist + o.logo;
        if (n > 0) return `видно шапку страницы: меню/крестик ${o.burgerOrClose}, корзина ${o.cart}, сердце ${o.wishlist}, лого ${o.logo}`;
      }
      return null;
    },
  },
  {
    id: "только-корзина",
    bug: "4",
    title: "в шапке панели крестик и корзина, без избранного",
    check: (m) => {
      if (!m.opened) return null;
      const p = m.inPanel;
      return p.wishlist === 0 && p.cart === 1 ? null : `в панели: корзина ${p.cart}, избранное ${p.wishlist}`;
    },
  },
  {
    id: "скролл",
    bug: "2",
    title: "содержимое панели прокручивается, страница под ней — нет",
    check: (m) => {
      if (!m.opened) return null;
      const s = m.scroll;
      if (s.panelScrollable && s.panelAfter <= s.panelBefore) return `панель не прокрутилась (${s.panelBefore}→${s.panelAfter})`;
      if (s.pageAfter !== s.pageBefore) return `страница под панелью уехала (${s.pageBefore}→${s.pageAfter})`;
      return null;
    },
  },
  {
    id: "стрелка-раскрывает",
    bug: "6",
    title: "нажатие на стрелку раскрывает вложенные, меню не закрывается и никуда не уводит",
    check: (m) => {
      if (!m.opened) return null;
      const a = m.arrow;
      if (!a.found) return "пункт с вложенными не найден";
      if (a.navigated) return `нажатие увело на ${a.navigated}`;
      if (!a.menuOpenAfter) return "меню закрылось";
      if (!a.subOpenAfter) return "вложенные не раскрылись";
      return null;
    },
  },
  {
    id: "липкая-шапка-на-месте",
    bug: "2",
    title: "липкая шапка не уезжает, пока меню открыто (замок прокрутки её не отрывает)",
    check: (m, sc) => {
      if (!m.opened || sc.stickiness === "none") return null;
      const t = m.headerTop;
      if (t.before === null || t.open === null || t.afterWheel === null) return "корень шапки не найден";
      return t.open === t.before && t.afterWheel === t.before
        ? null
        : `верх шапки: до ${t.before}, открыто ${t.open}, после колеса ${t.afterWheel}`;
    },
  },
  {
    id: "плавно-выезжает",
    bug: "м1",
    title: "панель плавно выезжает: промежуточные положения, без откатов и мигания",
    check: (m) => {
      if (!m.opened) return null;
      const a = m.anim.open;
      if (a.flash) return "панель мигнула при открытии";
      if (a.steps < 4) return `появилась рывком: промежуточных положений ${a.steps}`;
      if (a.backwards > 0) return `дёргается: откатов назад ${a.backwards}`;
      if (a.settledMs === null || a.settledMs > 600) return `не встала на место за 600 мс (${a.settledMs ?? "—"})`;
      return null;
    },
  },
  {
    id: "плавно-уходит",
    bug: "м1",
    title: "панель плавно уходит: уезжает к краю и только потом пропадает",
    check: (m) => {
      if (!m.opened || m.arrow.navigated) return null;
      const a = m.anim.close;
      if (a.goneMs === null) return "панель не закрылась за 700 мс";
      if (a.flash) return "панель мигнула при закрытии";
      if (a.hiddenBeforeOut || a.steps < 4) return `пропала рывком: промежуточных положений ${a.steps}`;
      if (a.backwards > 0) return `дёргается: откатов назад ${a.backwards}`;
      return null;
    },
  },
  {
    id: "страница-не-дёргается",
    bug: "м1",
    title: "содержимое страницы не сдвигается, когда панель открывается",
    check: (m) => (!m.opened || Math.abs(m.anim.pageShift) < 0.5 ? null : `страница сдвинулась на ${m.anim.pageShift}px`),
  },
  {
    id: "стрелки-только-у-вложенных",
    bug: "6",
    title: "стрелка только у пунктов с подпунктами",
    check: (m) => (!m.opened || m.arrow.arrowsOnPlainItems === 0 ? null : `стрелок у пунктов без вложенных: ${m.arrow.arrowsOnPlainItems}`),
  },
];

export function violations(rows: Measure[]): Array<{ theme: string; scenario: string; rule: string; bug: string; problem: string }> {
  const out: Array<{ theme: string; scenario: string; rule: string; bug: string; problem: string }> = [];
  for (const m of rows) {
    const sc = SCENARIOS.find((s) => s.id === m.scenario)!;
    for (const r of RULES) {
      const p = r.check(m, sc);
      if (p) out.push({ theme: m.theme, scenario: m.scenario, rule: r.id, bug: r.bug, problem: p });
    }
  }
  return out;
}

export async function measureAll(themes: readonly string[] = THEMES, scenarios: Scenario[] = SCENARIOS): Promise<Measure[]> {
  const browser = await chromium.launch();
  try {
    const out: Measure[] = [];
    for (const theme of themes) {
      for (const sc of scenarios) out.push(await measureOne(browser, theme, sc));
    }
    return out;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && /measure-side-menu/.test(process.argv[1])) {
  const onlyTheme = process.argv.find((a) => a.startsWith("--theme="))?.slice(8);
  const onlySc = process.argv.find((a) => a.startsWith("--sc="))?.slice(5);
  measureAll(
    onlyTheme ? [onlyTheme] : THEMES,
    onlySc ? SCENARIOS.filter((s) => s.id === onlySc) : SCENARIOS,
  ).then((rows) => {
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify({ rows, violations: violations(rows) }, null, 2));
      return;
    }
    if (process.argv.includes("--rules")) {
      const v = violations(rows);
      const checks = rows.length * RULES.length;
      // «Tests: 0 total» уже обманывал: пустой прогон выглядит зелёным. Полный
      // прогон обязан дать ровно темы × сценарии клеток.
      const expected = (onlyTheme ? 1 : THEMES.length) * (onlySc ? 1 : SCENARIOS.length);
      if (rows.length !== expected) {
        console.log(`клеток ${rows.length} вместо ${expected} — замер неполный`);
        process.exitCode = 1;
        return;
      }
      console.log(`Боковое меню: ${rows.length} клеток (темы × сценарии), ${checks} проверок, нарушений ${v.length}`);
      for (const r of RULES) {
        const hit = v.filter((x) => x.rule === r.id);
        console.log(`\n[${hit.length ? "✗" : "✓"}] баг ${r.bug}: ${r.title} — нарушений ${hit.length}`);
        for (const x of hit) console.log(`    ${x.theme.padEnd(7)} ${x.scenario.padEnd(18)} ${x.problem}`);
      }
      process.exitCode = v.length ? 1 : 0;
      return;
    }
    for (const r of rows) {
      const rc = r.rect ? `${r.rect.x},${r.rect.y} ${r.rect.w}×${r.rect.h}` : "—";
      console.log(
        [
          `${r.theme.padEnd(7)} ${r.scenario.padEnd(18)}`,
          `открыто=${r.opened ? "да" : "НЕТ"}`,
          `панель=${rc} (окно ${r.viewport.w}×${r.viewport.h})`,
          `накрыто=${Math.round(r.coveredShare * 100)}%`,
          `сверху: меню/крестик=${r.topmost.burgerOrClose} корзина=${r.topmost.cart} сердце=${r.topmost.wishlist} лого=${r.topmost.logo}`,
          `в панели: корзина=${r.inPanel.cart} сердце=${r.inPanel.wishlist} крестик=${r.inPanel.close}`,
          `1-й пункт=+${r.firstItemOffset ?? "—"}`,
          `скролл панели ${r.scroll.panelBefore}→${r.scroll.panelAfter} (можно=${r.scroll.panelScrollable ? "да" : "нет"}), страницы ${r.scroll.pageBefore}→${r.scroll.pageAfter}`,
          `стрелка: меню=${r.arrow.menuOpenAfter ? "открыто" : "ЗАКРЫЛОСЬ"} вложенные=${r.arrow.subOpenAfter ? "раскрыты" : "НЕТ"} ушли=${r.arrow.navigated ?? "нет"} стрелок у простых=${r.arrow.arrowsOnPlainItems}`,
          r.notes.length ? `‼ ${r.notes.join("; ")}` : "",
        ].join(" | "),
      );
    }
  });
}
