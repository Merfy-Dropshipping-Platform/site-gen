/**
 * «Увеличение» секции «Товар» — проводка обработчиков к кадрам фото.
 *
 * Баг тестировщика (2026-09-13, п.1): настройка доезжает до разметки
 * (`data-zoom-mode="none|hover|click"` на корне секции меняется), но читать её
 * некому — на фото нет ни одного обработчика, курсор `default`, по клику ничего
 * не открывается, по наведению фото не растёт.
 *
 * Замер до правки (браузер, dist/_measure/run.mjs):
 *   • макет по умолчанию «2 колонки» — у ЧЕТЫРЁХ тем на theme-base кадр это
 *     плитка сетки `[data-media-index]`, героя `[data-product-hero]` в этом
 *     макете нет вовсе → обе ветки проводки (`heroEl && …`) не срабатывали НИ В
 *     ОДНОМ из трёх режимов: слушателей нет, cursor=auto;
 *   • flux: «Наведение» работало, «Нажатие» — нет (готовый
 *     `openProductLightbox` лежал в файле и никем не вызывался).
 *
 * Поэтому сторожим не «есть ли код зума в файле», а ПРОВОДКУ: именованная
 * функция `wireGalleryZoom(корень, режим, openLightbox)` обязана оживить КАЖДЫЙ
 * кадр галереи в любом из четырёх макетов и молчать при «Нет». Портов два и оба
 * выполняют один контракт:
 *   • packages/theme-base/blocks/Product/Product.astro — rose, vanilla, satin, bloom
 *   • themes/flux/src/components/sections/FeaturedProduct.astro — flux
 * (авторитет — dist/theme-sections/<тема>/manifest.json: «Product» есть только
 * у flux, остальные четыре падают в общий блок theme-base).
 *
 * Функция достаётся из ИСХОДНИКА порта и исполняется на мини-DOM (jsdom в
 * зависимостях нет, вводить новую зависимость ради теста нельзя — см.
 * product-media-order.spec.ts, тот же приём).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

const SITES_ROOT = join(__dirname, "..", "..", "..");
const THEME_BASE_PRODUCT = join(
  SITES_ROOT,
  "packages/theme-base/blocks/Product/Product.astro",
);
const FLUX_PRODUCT = join(
  SITES_ROOT,
  "themes/flux/src/components/sections/FeaturedProduct.astro",
);

// ───────────────────────── мини-DOM ─────────────────────────
// Ровно то, что трогает проводка: атрибуты, querySelector(All) по атрибутам,
// style, слушатели и их вызов.

type Attrs = Record<string, string>;

interface SimpleSelector {
  tag: string | null;
  attrs: { name: string; value: string | null }[];
}

function parseSelector(sel: string): SimpleSelector[] {
  return sel.split(",").map((part) => {
    const chunk = part.trim();
    const attrs: SimpleSelector["attrs"] = [];
    const tagMatch = /^[a-zA-Z][\w-]*/.exec(chunk);
    const re = /\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk)))
      attrs.push({ name: m[1], value: m[2] ?? null });
    return { tag: tagMatch ? tagMatch[0] : null, attrs };
  });
}

class El {
  tagName: string;
  attrs: Attrs;
  children: El[] = [];
  parent: El | null = null;
  style: Record<string, string> = {};
  listeners: Record<string, ((ev: unknown) => void)[]> = {};

  constructor(tagName: string, attrs: Attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
  }

  append(...kids: El[]): this {
    for (const k of kids) {
      k.parent = this;
      this.children.push(k);
    }
    return this;
  }

  getAttribute(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attrs, name)
      ? this.attrs[name]
      : null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = String(value);
  }
  removeAttribute(name: string): void {
    delete this.attrs[name];
  }
  hasAttribute(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  matches(sel: string): boolean {
    return parseSelector(sel).some((s) => {
      if (!s.tag && s.attrs.length === 0) return false;
      if (s.tag && this.tagName !== s.tag.toUpperCase()) return false;
      return s.attrs.every(
        (a) =>
          this.hasAttribute(a.name) &&
          (a.value === null || this.getAttribute(a.name) === a.value),
      );
    });
  }

  private walk(out: El[]): El[] {
    for (const c of this.children) {
      out.push(c);
      c.walk(out);
    }
    return out;
  }
  querySelectorAll(sel: string): El[] {
    return this.walk([]).filter((e) => e.matches(sel));
  }
  querySelector(sel: string): El | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  /** Типы навешенных слушателей — в алфавитном порядке. */
  wired(): string[] {
    return Object.keys(this.listeners)
      .filter((t) => this.listeners[t].length > 0)
      .sort();
  }
  fire(type: string, ev: Record<string, unknown> = {}): void {
    (this.listeners[type] ?? []).forEach((fn) =>
      fn({ target: this, preventDefault() {}, stopPropagation() {}, ...ev }),
    );
  }
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    return { left: 0, top: 0, width: 400, height: 400 };
  }
}

// ─────────────── извлечение проводки из исходника порта ───────────────

function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) {
    throw new Error(
      `в порте нет функции ${name}(…) — проводка «Увеличения» обязана быть именованной, иначе её нечем сторожить`,
    );
  }
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`не закрыта функция ${name} в исходнике`);
}

type Wire = (
  root: El,
  mode: string,
  openLightbox: (startSrc: string) => void,
) => number;

/** Порты пишут на TS (flux) и на JS (theme-base) — снимаем типы одинаково. */
function loadZoomWiring(file: string): Wire {
  const fnSrc = extractFunction(readFileSync(file, "utf8"), "wireGalleryZoom");
  const js = ts.transpileModule(fnSrc, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${js}; return wireGalleryZoom;`)() as Wire;
}

// ─────────────────────── разметка макетов ───────────────────────

const MEDIA = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];

/** split / carousel / stacked общего блока: герой + лента-переключатели. */
function themeBaseHeroLayout(): El {
  const heroImg = new El("img", {
    src: MEDIA[0],
    "data-product-hero-image": "",
    "data-media-src": MEDIA[0],
  });
  const strip = new El("div", { "data-product-thumbs": "" });
  MEDIA.forEach((src, idx) =>
    strip.append(
      new El("button", {
        "data-product-thumb": "",
        "data-media-index": String(idx),
        "data-media-src": src,
      }).append(new El("img", { src })),
    ),
  );
  return new El("div", { "data-product-gallery": "" }).append(
    new El("div", { "data-product-hero": "" }).append(heroImg),
    strip,
  );
}

/** «2 колонки» общего блока: героя НЕТ, каждая плитка — самостоятельное фото. */
function themeBaseGridLayout(): El {
  const grid = new El("div", {
    "data-product-thumbs": "",
    "data-thumbs-axis": "grid",
  });
  MEDIA.forEach((src, idx) =>
    grid.append(
      new El("div", {
        "data-media-index": String(idx),
        "data-media-src": src,
      }).append(
        new El(
          "img",
          idx === 0
            ? { src, "data-product-hero-image": "", "data-media-src": src }
            : { src },
        ),
      ),
    ),
  );
  return new El("div", { "data-product-gallery": "" }).append(grid);
}

/** Стандартные макеты flux: герой [data-cfg-hero] + лента [data-cfg-thumb]. */
function fluxHeroLayout(): El {
  const track = new El("div", { "data-cfg-thumbs-track": "" });
  MEDIA.forEach((src, idx) =>
    track.append(
      new El("button", {
        "data-cfg-thumb": "",
        "data-image": src,
        "data-media-index": String(idx),
      }).append(new El("img", { src })),
    ),
  );
  return new El("div", { "data-cfg-gallery": "" }).append(
    new El("div", { "data-cfg-hero": "" }).append(
      new El("img", { src: MEDIA[0], "data-cfg-main": "" }),
    ),
    track,
  );
}

/** «2 колонки» flux: плитки сетки, у первой дополнительно data-cfg-hero. */
function fluxGridLayout(): El {
  const grid = new El("div", {});
  MEDIA.forEach((src, idx) =>
    grid.append(
      new El(
        "div",
        idx === 0
          ? { "data-cfg-hero": "", "data-media-index": "0", "data-image": src }
          : { "data-media-index": String(idx), "data-image": src },
      ).append(
        new El("img", idx === 0 ? { src, "data-cfg-main": "" } : { src }),
      ),
    ),
  );
  return new El("div", { "data-cfg-gallery": "" }).append(grid);
}

const PORTS = [
  {
    name: "theme-base (rose, vanilla, satin, bloom)",
    file: THEME_BASE_PRODUCT,
    hero: themeBaseHeroLayout,
    grid: themeBaseGridLayout,
    frameSel: "[data-product-hero]",
    tileSel: "[data-media-index]",
  },
  {
    name: "flux (собственный порт FeaturedProduct)",
    file: FLUX_PRODUCT,
    hero: fluxHeroLayout,
    grid: fluxGridLayout,
    frameSel: "[data-cfg-hero]",
    tileSel: "[data-media-index]",
  },
];

/** Кадры = всё, что оживила проводка (у кадра появляется метка). */
const wiredFrames = (root: El): El[] =>
  root.querySelectorAll("[data-zoom-wired]");

describe.each(PORTS)(
  "«Увеличение» — $name",
  ({ file, hero, grid, frameSel }) => {
    describe.each([
      ["макет с героем (Сложенный/Карусель/Миниатюрный)", "hero"],
      ["макет «2 колонки» (героя нет — кадры это плитки)", "grid"],
    ])("%s", (_label, kind) => {
      const mount = () => (kind === "hero" ? hero() : grid());
      const expectedFrames = kind === "hero" ? 1 : MEDIA.length;

      it("«Нет» — ни одного обработчика и курсор не трогаем", () => {
        const wire = loadZoomWiring(file);
        const root = mount();
        expect(wire(root, "none", () => {})).toBe(0);
        expect(wiredFrames(root)).toHaveLength(0);
        const frames = root.querySelectorAll("[data-media-index], " + frameSel);
        frames.forEach((f) => {
          expect(f.wired()).toEqual([]);
          expect(f.style.cursor ?? "").toBe("");
        });
      });

      it("«Наведение» — каждый кадр получает слежение за курсором", () => {
        const wire = loadZoomWiring(file);
        const root = mount();
        expect(wire(root, "hover", () => {})).toBe(expectedFrames);
        const frames = wiredFrames(root);
        expect(frames).toHaveLength(expectedFrames);
        frames.forEach((f) => {
          expect(f.wired()).toEqual(["mouseenter", "mouseleave", "mousemove"]);
          expect(f.style.cursor).toBe("zoom-in");
        });
      });

      it("«Наведение» — фото увеличивается под курсором и возвращается назад", () => {
        const wire = loadZoomWiring(file);
        const root = mount();
        wire(root, "hover", () => {});
        const frame = wiredFrames(root)[0];
        const img = frame.querySelector("[src]")!;

        frame.fire("mouseenter");
        expect(img.style.transform).toBe("scale(2)");
        frame.fire("mousemove", { clientX: 100, clientY: 300 });
        expect(img.style.transformOrigin).toBe("25% 75%");
        frame.fire("mouseleave");
        expect(img.style.transform).toBe("");
      });

      it("«Нажатие» — клик по кадру открывает лупу с ЭТИМ фото", () => {
        const wire = loadZoomWiring(file);
        const root = mount();
        const opened: string[] = [];
        expect(wire(root, "click", (src) => opened.push(src))).toBe(
          expectedFrames,
        );

        const frames = wiredFrames(root);
        frames.forEach((f) => {
          expect(f.wired()).toEqual(["click"]);
          expect(f.style.cursor).toBe("zoom-in");
        });

        frames[frames.length - 1].fire("click");
        expect(opened).toEqual([
          MEDIA[expectedFrames === 1 ? 0 : MEDIA.length - 1],
        ]);
      });

      it("«Нажатие» не растягивает фото, «Наведение» не открывает лупу", () => {
        const wire = loadZoomWiring(file);
        const rootClick = mount();
        const opened: string[] = [];
        wire(rootClick, "click", (src) => opened.push(src));
        const clickFrame = wiredFrames(rootClick)[0];
        clickFrame.fire("mouseenter");
        expect(clickFrame.querySelector("[src]")!.style.transform ?? "").toBe(
          "",
        );

        const rootHover = mount();
        const opened2: string[] = [];
        wire(rootHover, "hover", (src) => opened2.push(src));
        wiredFrames(rootHover)[0].fire("click");
        expect(opened2).toEqual([]);
      });

      it("повторная гидрация (hot-replace конструктора) не двоит обработчики", () => {
        const wire = loadZoomWiring(file);
        const root = mount();
        wire(root, "hover", () => {});
        const before = wiredFrames(root).map((f) => f.wired().length);
        wire(root, "hover", () => {});
        expect(wiredFrames(root).map((f) => f.wired().length)).toEqual(before);
      });
    });

    it("смена режима в конструкторе перепроводит кадр, старый режим замолкает", () => {
      const wire = loadZoomWiring(file);
      const root = hero();
      wire(root, "hover", () => {});
      const opened: string[] = [];
      wire(root, "click", (src) => opened.push(src));
      const frame = wiredFrames(root)[0];
      expect(frame.getAttribute("data-zoom-wired")).toBe("click");

      frame.fire("click");
      expect(opened).toEqual([MEDIA[0]]);

      // Слушатели прошлого режима снять нечем (анонимные), поэтому они обязаны
      // сами замолкать по метке кадра — иначе «Нажатие» тащило бы за собой зум
      // «Наведения» после правки в конструкторе.
      frame.fire("mouseenter");
      expect(frame.querySelector("[src]")!.style.transform ?? "").toBe("");
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════
//  Второй слой: та же проводка НА РЕАЛЬНОЙ РАЗМЕТКЕ отрендеренной секции.
//
//  Зачем он понадобился (2026-09-14). Тестировщик прислал «Увеличение
//  (Нажатие / Наведение) ни на что не влияет при настройке 2 колонки» ПОВТОРНО,
//  через час после того, как баг закрыли. Баг не воспроизвёлся (витрины и
//  превью конструктора мерены браузером по пяти темам), но проверка верхнего
//  слоя оказалась бумажной: она берёт функцию из исходника и запускает её на
//  РУКОПИСНОМ мини-DOM, который живёт в этом же файле. Четыре саботажа прошли
//  её насквозь — все 26 проверок остались зелёными:
//
//    S1  убрать сам ВЫЗОВ wireGalleryZoom(galleryEl, zoomMode, …)   → зелено
//    S2  снять data-media-index с плиток «2 колонки» в ProductGallery → зелено
//    S3  снять data-zoom-mode с корня секции                         → зелено
//    S4  зашить во flux литерал "none" вместо прочитанного режима    → зелено
//
//  S2 — это ДОСЛОВНО форма исходного бага: в «2 колонках» героя нет, и если
//  плитка перестаёт быть кадром, оживлять становится нечего. Верхний слой это
//  не видит принципиально: свой мини-DOM он рисует сам и про ProductGallery.astro
//  не знает.
//
//  Поэтому ниже — тот же контракт, но на живой цепочке:
//    • секция рендерится РОВНО тем модулем, который тема отдаёт на витрину и в
//      превью (render-theme-sections.mjs, cascade+live — см. его шапку);
//    • товар приезжает общей заглушкой каталога (storefront-data-stub.mjs) —
//      без неё Product.astro рисует «Нет фото», и кадров не бывает ни в одном
//      макете, то есть проверка снова мерила бы пустоту;
//    • проводка берётся ИЗ ОТРЕНДЕРЕННОГО скрипта секции, а не из исходника —
//      это тот самый текст, который уезжает в браузер;
//    • разметка разбирается node-html-parser (прямая зависимость, package.json,
//      им же пользуются rich-text-coverage.mjs и scripts/lib/validation-checks).
//
//  Требует собранных блоков и секций:
//    pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
// ═══════════════════════════════════════════════════════════════════════════

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const CATALOG_STUB = resolve(__dirname, "storefront-data-stub.mjs");

/** Пять тем магазина. Порт у flux свой, у остальных — общий theme-base. */
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
type Theme = (typeof THEMES)[number];

/** Все четыре макета панели «Макет». «2 колонки» — дефолт и место бага. */
const LAYOUTS = ["two-columns", "stacked", "carousel", "split"] as const;

/** Селекторы кадра и миниатюры у двух портов. */
const PORT_SEL: Record<"flux" | "base", { frames: string; thumb: string }> = {
  flux: {
    frames: "[data-cfg-hero], [data-media-index]",
    thumb: "data-cfg-thumb",
  },
  base: {
    frames: "[data-product-hero], [data-media-index]",
    thumb: "data-product-thumb",
  },
};
const portOf = (t: Theme) => (t === "flux" ? PORT_SEL.flux : PORT_SEL.base);

/** Рендер дорогой (отдельный процесс на каждый) — держим по одному на набор. */
const RENDER_CACHE = new Map<string, string>();

function renderSection(theme: Theme, layout: string, zoomMode: string): string {
  const key = `${theme}|${layout}|${zoomMode}`;
  const hit = RENDER_CACHE.get(key);
  if (hit !== undefined) return hit;
  const jobs = [
    {
      block: "Product",
      cascade: true,
      live: true,
      props: {
        id: "Product-1",
        siteId: "test-site",
        productId: "p1",
        layout,
        zoomMode,
        padding: { top: 40, bottom: 40 },
      },
    },
  ];
  const out = execFileSync(
    "node",
    ["--import", CATALOG_STUB, RENDERER, theme, JSON.stringify(jobs)],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const row = JSON.parse(out)[0] as { html?: string; error?: string };
  if (row.error) throw new Error(`${theme}/${layout}: ${row.error}`);
  const html = row.html ?? "";
  RENDER_CACHE.set(key, html);
  return html;
}

/**
 * Дооснащает разобранные узлы тем, чего нет у node-html-parser, но что трогает
 * проводка: style, слушатели, размеры кадра. Разметку не меняем — только
 * доклеиваем поведение браузера.
 */
function liven(root: HTMLElement): void {
  for (const el of root.querySelectorAll("*")) {
    const node = el as unknown as Record<string, unknown>;
    node.style = {};
    node.listeners = {};
    node.addEventListener = function (type: string, fn: (ev: unknown) => void) {
      const ls = node.listeners as Record<string, ((ev: unknown) => void)[]>;
      (ls[type] ??= []).push(fn);
    };
    node.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 400,
    });
    node.wired = () => {
      const ls = node.listeners as Record<string, ((ev: unknown) => void)[]>;
      return Object.keys(ls)
        .filter((t) => ls[t].length > 0)
        .sort();
    };
    node.fire = (type: string, ev: Record<string, unknown> = {}) => {
      const ls = node.listeners as Record<string, ((ev: unknown) => void)[]>;
      (ls[type] ?? []).forEach((fn) =>
        fn({ target: el, preventDefault() {}, stopPropagation() {}, ...ev }),
      );
    };
  }
}

type LiveEl = HTMLElement & {
  style: Record<string, string>;
  wired: () => string[];
  fire: (type: string, ev?: Record<string, unknown>) => void;
};

/** Инлайн-скрипт секции — тот, что уезжает в браузер. */
function sectionScript(root: HTMLElement): string {
  const withWiring = root
    .querySelectorAll("script")
    .map((s) => s.textContent)
    .filter((t) => t.includes("wireGalleryZoom"));
  return withWiring.join("\n");
}

/** Проводка, вынутая ИЗ ОТРЕНДЕРЕННОГО скрипта (а не из исходника порта). */
function wiringFromRendered(script: string): Wire {
  const fnSrc = extractFunction(script, "wireGalleryZoom");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${fnSrc}; return wireGalleryZoom;`)() as Wire;
}

interface CallSite {
  /** Сколько раз проводку ВЫЗВАЛИ (объявление не считается). */
  calls: number;
  /** Второй аргумент вызова — как он записан в коде. */
  modeArg: string | null;
  /** Вид второго аргумента: имя переменной или литерал. */
  modeArgIsLiteral: boolean;
  /** Из чего эта переменная получена (текст инициализатора). */
  modeInit: string | null;
}

/** Разбор вызова проводки в отрендеренном скрипте (ts уже в зависимостях). */
function callSiteOf(script: string): CallSite {
  const sf = ts.createSourceFile(
    "section.js",
    script,
    ts.ScriptTarget.ES2019,
    true,
    ts.ScriptKind.JS,
  );
  const res: CallSite = {
    calls: 0,
    modeArg: null,
    modeArgIsLiteral: false,
    modeInit: null,
  };
  const decls = new Map<string, string>();
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer
    ) {
      decls.set(n.name.text, n.initializer.getText(sf));
    }
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "wireGalleryZoom"
    ) {
      res.calls++;
      const arg = n.arguments[1];
      if (arg) {
        res.modeArg = arg.getText(sf);
        res.modeArgIsLiteral =
          ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (res.modeArg && !res.modeArgIsLiteral) {
    res.modeInit = decls.get(res.modeArg) ?? null;
  }
  return res;
}

/**
 * Источник кадра — ровно той же лестницей, что и openLightbox в проводке.
 */
const srcOf = (el: HTMLElement): string =>
  el.getAttribute("data-media-src") ||
  el.getAttribute("data-image") ||
  el.querySelector("img")?.getAttribute("src") ||
  "";

/**
 * Все фото галереи по разметке: источники носят и кадры, и миниатюры, поэтому
 * множество их значений — это ровно снимки товара, без догадок о числе.
 */
const galleryPhotos = (section: HTMLElement): Set<string> =>
  new Set(
    section
      .querySelectorAll("[data-media-src], [data-image]")
      .map(srcOf)
      .filter(Boolean),
  );

const built = (): boolean =>
  existsSync(resolve(SITES_ROOT, "dist", "astro-blocks", "manifest.json")) &&
  THEMES.every((t) =>
    existsSync(
      resolve(SITES_ROOT, "dist", "theme-sections", t, "manifest.json"),
    ),
  );

describe("«Увеличение» — живая цепочка: реальная разметка секции", () => {
  it("блоки и секции всех пяти тем собраны (pnpm build:blocks && pnpm build:theme-sections:all)", () => {
    expect(built()).toBe(true);
  });

  describe.each(THEMES)("%s", (theme) => {
    describe.each(LAYOUTS)("макет «%s»", (layout) => {
      it("режим доезжает до корня секции и его читает проводка, а не литерал", () => {
        if (!built()) return;
        const root = parseHtml(renderSection(theme, layout, "click"));
        const section = root.querySelector("[data-zoom-mode]");
        // S3: без атрибута на корне читать режим неоткуда.
        expect(section).not.toBeNull();
        expect(section!.getAttribute("data-zoom-mode")).toBe("click");

        const site = callSiteOf(sectionScript(root));
        // S1: функция может быть образцовой и при этом никем не вызванной.
        expect(site.calls).toBeGreaterThanOrEqual(1);
        // S4: режим обязан приехать из разметки, а не быть зашит в вызове.
        expect(site.modeArgIsLiteral).toBe(false);
        expect(site.modeInit ?? "").toContain("data-zoom-mode");
      });

      it("«Наведение» оживляет КАЖДЫЙ кадр с фото, миниатюры не трогает", () => {
        if (!built()) return;
        const html = renderSection(theme, layout, "hover");
        const root = parseHtml(html);
        liven(root);
        const section = root.querySelector("[data-zoom-mode]")!;
        const { frames: frameSel, thumb } = portOf(theme);
        const expected = section
          .querySelectorAll(frameSel)
          .filter((e) => !e.hasAttribute(thumb) && e.querySelector("img"));

        // S2: в «2 колонках» героя нет — если плитка перестала быть кадром,
        // оживлять нечего, и это ровно исходный баг.
        expect(expected.length).toBeGreaterThanOrEqual(1);

        const wire = wiringFromRendered(sectionScript(root));
        expect(wire(section as never, "hover", () => {})).toBe(expected.length);

        const wiredEls = section.querySelectorAll("[data-zoom-wired]");
        expect(wiredEls.length).toBe(expected.length);

        // «2 колонки» — героя нет, КАЖДОЕ фото само себе кадр. Проверяем не
        // «кадров хотя бы один», а покрытие: во flux первая плитка вдобавок
        // несёт data-cfg-hero, поэтому счётный порог там проходил и с мёртвыми
        // остальными плитками (саботаж S5 2026-09-14 прошёл гард насквозь).
        if (layout === "two-columns") {
          const photos = galleryPhotos(section);
          expect(photos.size).toBeGreaterThanOrEqual(2);
          const covered = new Set(wiredEls.map((e) => srcOf(e)));
          expect([...photos].sort()).toEqual([...covered].sort());
        }
        for (const el of wiredEls) {
          const f = el as LiveEl;
          expect(f.getAttribute("data-zoom-wired")).toBe("hover");
          expect(f.wired()).toEqual(["mouseenter", "mouseleave", "mousemove"]);
          expect(f.style.cursor).toBe("zoom-in");
          // Миниатюра-переключатель кадром не становится никогда.
          expect(f.hasAttribute(thumb)).toBe(false);
        }
      });

      it("«Наведение» — фото под курсором растёт и возвращается назад", () => {
        if (!built()) return;
        const root = parseHtml(renderSection(theme, layout, "hover"));
        liven(root);
        const section = root.querySelector("[data-zoom-mode]")!;
        const wire = wiringFromRendered(sectionScript(root));
        wire(section as never, "hover", () => {});

        const frame = section.querySelector("[data-zoom-wired]") as LiveEl;
        const img = frame.querySelector("img") as unknown as LiveEl;
        frame.fire("mouseenter");
        expect(img.style.transform).toBe("scale(2)");
        frame.fire("mousemove", { clientX: 100, clientY: 300 });
        expect(img.style.transformOrigin).toBe("25% 75%");
        frame.fire("mouseleave");
        expect(img.style.transform).toBe("");
      });

      it("«Нажатие» — клик по кадру открывает лупу с ЭТИМ фото", () => {
        if (!built()) return;
        const root = parseHtml(renderSection(theme, layout, "click"));
        liven(root);
        const section = root.querySelector("[data-zoom-mode]")!;
        const wire = wiringFromRendered(sectionScript(root));
        const opened: string[] = [];
        const n = wire(section as never, "click", (src) => opened.push(src));
        expect(n).toBeGreaterThanOrEqual(1);

        const frames = section.querySelectorAll("[data-zoom-wired]");
        for (const el of frames) {
          const f = el as LiveEl;
          expect(f.wired()).toEqual(["click"]);
          expect(f.style.cursor).toBe("zoom-in");
        }
        const last = frames[frames.length - 1] as LiveEl;
        const expectSrc =
          last.getAttribute("data-media-src") ||
          last.getAttribute("data-image") ||
          (last.querySelector("img")?.getAttribute("src") ?? "");
        last.fire("click");
        expect(opened).toEqual([expectSrc]);
        expect(expectSrc).not.toBe("");
      });

      it("«Нет» — ни одного обработчика, курсор не тронут", () => {
        if (!built()) return;
        const root = parseHtml(renderSection(theme, layout, "none"));
        liven(root);
        const section = root.querySelector("[data-zoom-mode]")!;
        expect(section.getAttribute("data-zoom-mode")).toBe("none");

        const wire = wiringFromRendered(sectionScript(root));
        expect(wire(section as never, "none", () => {})).toBe(0);
        expect(section.querySelectorAll("[data-zoom-wired]").length).toBe(0);

        const { frames: frameSel } = portOf(theme);
        for (const el of section.querySelectorAll(frameSel)) {
          const f = el as LiveEl;
          expect(f.wired()).toEqual([]);
          expect(f.style.cursor ?? "").toBe("");
        }
      });
    });
  });
});
