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
