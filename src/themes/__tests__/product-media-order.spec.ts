/**
 * Порядок медиафайлов секции «Товар» при переключении фото.
 *
 * Баг тестировщика (2026-09-13, п.3): «при макете Миниатюрный, Сложенный,
 * Карусель медиафайлы заменяют друг друга и меняются местами». Причина —
 * обработчик клика по миниатюре делал СВАП: клик клал фото миниатюры в героя,
 * а старое фото героя — в слот миниатюры. Позиции файлов переезжали.
 *
 * Ожидание владельца: «каждый файл на своём месте, не меняя друг друга —
 * просто меняется отображаемый медиафайл, а не их позиция в секции».
 *
 * Мерим ПОРЯДОК, а не факт «картинка сменилась»: снимаем список src в порядке
 * следования узлов до клика и после. Портов у секции два и оба обязаны
 * выполнять один контракт:
 *   • packages/theme-base/blocks/Product/Product.astro — rose, vanilla, satin, bloom
 *   • themes/flux/src/components/sections/FeaturedProduct.astro — flux
 * (авторитет — dist/theme-sections/<тема>/manifest.json: «Product» есть только
 * у flux, остальные четыре падают в общий блок theme-base).
 *
 * Обработчик у обоих портов вынесен в именованную функцию
 * `wireGalleryMediaSwitch(корень, getHero)` — тест достаёт её из ИСХОДНИКА
 * порта и исполняет на мини-DOM (без jsdom: его нет в зависимостях, а вводить
 * новую зависимость ради теста нельзя). Мини-DOM свой, в этом файле.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

const SITES_ROOT = join(__dirname, "..", "..", "..");
const THEME_BASE_PRODUCT = join(
  SITES_ROOT,
  "packages/theme-base/blocks/Product/Product.astro",
);
const THEME_BASE_GALLERY = join(
  SITES_ROOT,
  "packages/theme-base/blocks/Product/ProductGallery.astro",
);
const FLUX_PRODUCT = join(
  SITES_ROOT,
  "themes/flux/src/components/sections/FeaturedProduct.astro",
);

// ───────────────────────── мини-DOM ─────────────────────────
// Ровно то, что трогает обработчик: атрибуты, querySelector(All), closest,
// делегированный click, classList. Меньше — нельзя, больше — не нужно.

type Attrs = Record<string, string>;

interface SimpleSelector {
  tag: string | null;
  attrs: { name: string; value: string | null }[];
}

function parseSelector(sel: string): SimpleSelector[][] {
  return sel.split(",").map((part) =>
    part
      .trim()
      .split(/\s+/)
      .map((chunk) => {
        const attrs: SimpleSelector["attrs"] = [];
        const tagMatch = /^[a-zA-Z][\w-]*/.exec(chunk);
        const tag = tagMatch ? tagMatch[0] : null;
        const re = /\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(chunk)))
          attrs.push({ name: m[1], value: m[2] ?? null });
        return { tag, attrs };
      }),
  );
}

class El {
  tagName: string;
  attrs: Attrs;
  children: El[] = [];
  parent: El | null = null;
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};
  classList: {
    add: (...c: string[]) => void;
    remove: (...c: string[]) => void;
    contains: (c: string) => boolean;
  };

  constructor(tagName: string, attrs: Attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    const classes = new Set(
      (this.attrs.class ?? "").split(/\s+/).filter(Boolean),
    );
    this.classList = {
      add: (...c) => {
        c.forEach((x) => classes.add(x));
        this.attrs.class = [...classes].join(" ");
      },
      remove: (...c) => {
        c.forEach((x) => classes.delete(x));
        this.attrs.class = [...classes].join(" ");
      },
      contains: (c) => classes.has(c),
    };
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

  private matchesSimple(s: SimpleSelector): boolean {
    if (s.tag && this.tagName !== s.tag.toUpperCase()) return false;
    return s.attrs.every(
      (a) =>
        this.hasAttribute(a.name) &&
        (a.value === null || this.getAttribute(a.name) === a.value),
    );
  }
  matches(sel: string): boolean {
    return parseSelector(sel).some((chain) =>
      this.matchesSimple(chain[chain.length - 1]),
    );
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
  closest(sel: string): El | null {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- подъём по предкам
    let n: El | null = this;
    while (n) {
      if (n.matches(sel)) return n;
      n = n.parent;
    }
    return null;
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  /** Всплывающий клик — как в браузере: цель, потом предки. */
  click(): void {
    const ev = {
      target: this as unknown,
      preventDefault() {},
      stopPropagation() {},
    };
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- всплытие по предкам
    let n: El | null = this;
    while (n) {
      (n.listeners.click ?? []).forEach((fn) => fn(ev));
      n = n.parent;
    }
  }
}

// ─────────────── извлечение обработчика из исходника порта ───────────────

/** Тело именованной функции из исходника (скан по балансу скобок). */
function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) {
    throw new Error(
      `в порте нет функции ${name}(…) — обработчик переключения медиа обязан быть именованным, иначе его нечем сторожить`,
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

/** Порты пишут на TS (flux) и на JS (theme-base) — снимаем типы одинаково. */
function loadSwitcher(
  file: string,
): (root: El, getHero: () => El | null) => void {
  const fnSrc = extractFunction(
    readFileSync(file, "utf8"),
    "wireGalleryMediaSwitch",
  );
  const js = ts.transpileModule(fnSrc, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${js}; return wireGalleryMediaSwitch;`)() as (
    root: El,
    getHero: () => El | null,
  ) => void;
}

// ─────────────────────── разметка макетов ───────────────────────

const MEDIA = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];

/** Лента миниатюр общего блока: ВСЕ файлы, позиция = data-media-index. */
function themeBaseGallery(): { gallery: El; hero: El } {
  const hero = new El("img", {
    src: MEDIA[0],
    alt: "Товар",
    "data-product-hero-image": "",
    "data-media-src": MEDIA[0],
  });
  const strip = new El("div", { "data-product-thumbs": "" });
  MEDIA.forEach((src, idx) => {
    strip.append(
      new El("button", {
        "data-product-thumb": "",
        "data-media-index": String(idx),
        "data-media-src": src,
        "data-media-alt": `Товар — фото ${idx + 1}`,
        "aria-current": idx === 0 ? "true" : "false",
      }).append(new El("img", { src, alt: `Товар — фото ${idx + 1}` })),
    );
  });
  const gallery = new El("div", { "data-product-gallery": "" }).append(
    new El("div", { "data-product-hero": "" }).append(hero),
    strip,
  );
  return { gallery, hero };
}

/** Лента flux: миниатюры уже содержат главное фото, источник — data-image. */
function fluxGallery(): { gallery: El; hero: El } {
  const hero = new El("img", {
    src: MEDIA[0],
    alt: "Товар",
    "data-cfg-main": "",
  });
  const track = new El("div", { "data-cfg-thumbs-track": "" });
  MEDIA.forEach((src, idx) => {
    track.append(
      new El("button", {
        "data-cfg-thumb": "",
        "data-image": src,
        "data-media-index": String(idx),
        "aria-current": idx === 0 ? "true" : "false",
      }).append(new El("img", { src, alt: "Товар" })),
    );
  });
  const gallery = new El("div", { "data-cfg-gallery": "" }).append(
    new El("div", { "data-cfg-hero": "" }).append(hero),
    track,
  );
  return { gallery, hero };
}

const PORTS = [
  {
    name: "theme-base (rose, vanilla, satin, bloom)",
    file: THEME_BASE_PRODUCT,
    mount: themeBaseGallery,
    thumbSel: "[data-product-thumb]",
  },
  {
    name: "flux (собственный порт FeaturedProduct)",
    file: FLUX_PRODUCT,
    mount: fluxGallery,
    thumbSel: "[data-cfg-thumb]",
  },
];

/** Порядок медиа = src всех <img> галереи в порядке следования узлов. */
const mediaOrder = (gallery: El): string[] =>
  gallery.querySelectorAll("img").map((n) => n.getAttribute("src") ?? "");

/** Порядок ленты по стабильному источнику (он не должен мутировать вовсе). */
const stripSources = (gallery: El, sel: string): string[] =>
  gallery
    .querySelectorAll(sel)
    .map(
      (b) =>
        b.getAttribute("data-media-src") ?? b.getAttribute("data-image") ?? "",
    );

describe.each(PORTS)(
  "порядок медиафайлов — $name",
  ({ file, mount, thumbSel }) => {
    it("клик по миниатюре не переставляет медиафайлы (позиции фиксированы)", () => {
      const wire = loadSwitcher(file);
      const { gallery, hero } = mount();
      wire(gallery, () => hero);

      const before = mediaOrder(gallery);
      const beforeStrip = stripSources(gallery, thumbSel);

      gallery.querySelectorAll(thumbSel)[2].click();

      expect(stripSources(gallery, thumbSel)).toEqual(beforeStrip);
      expect(mediaOrder(gallery).slice(1)).toEqual(before.slice(1)); // лента не тронута
    });

    it("меняется только отображаемый медиафайл героя", () => {
      const wire = loadSwitcher(file);
      const { gallery, hero } = mount();
      wire(gallery, () => hero);

      gallery.querySelectorAll(thumbSel)[2].click();
      expect(hero.getAttribute("src")).toBe(MEDIA[2]);

      gallery.querySelectorAll(thumbSel)[1].click();
      expect(hero.getAttribute("src")).toBe(MEDIA[1]);

      gallery.querySelectorAll(thumbSel)[0].click();
      expect(hero.getAttribute("src")).toBe(MEDIA[0]);
    });

    it("после серии переключений лента та же — ни дублей, ни пропаж", () => {
      const wire = loadSwitcher(file);
      const { gallery, hero } = mount();
      wire(gallery, () => hero);

      [3, 1, 2, 0, 3].forEach((i) =>
        gallery.querySelectorAll(thumbSel)[i].click(),
      );

      expect(stripSources(gallery, thumbSel)).toEqual(MEDIA);
      expect(new Set(stripSources(gallery, thumbSel)).size).toBe(MEDIA.length);
    });

    it("признак активной миниатюры переезжает на кликнутую", () => {
      const wire = loadSwitcher(file);
      const { gallery, hero } = mount();
      wire(gallery, () => hero);

      gallery.querySelectorAll(thumbSel)[2].click();
      expect(
        gallery
          .querySelectorAll(thumbSel)
          .map((b) => b.getAttribute("aria-current")),
      ).toEqual(["false", "false", "true", "false"]);
    });
  },
);

// ─────────────── контракт разметки (что нечего свапать) ───────────────

describe("разметка галереи общего блока", () => {
  const src = readFileSync(THEME_BASE_GALLERY, "utf8");

  it("в макетах split/carousel/stacked лента рисуется из ПОЛНОГО списка медиа", () => {
    // gallery.thumbs = все фото КРОМЕ главного. Если лента рисуется из него,
    // главное фото нигде не лежит — и «не потерять его» можно только свапом.
    expect(src).not.toMatch(/gallery\.thumbs\.map\(/);
    expect(
      (src.match(/allImages\.map\(/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("каждая плитка ленты несёт свою позицию и свой неизменный источник", () => {
    expect(
      (src.match(/data-media-index=/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);
    expect((src.match(/data-media-src=/g) ?? []).length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("в макете «2 колонки» плитки не переключатели — там нечего переключать", () => {
    const twoCols = src.slice(
      src.indexOf("layout === 'two-columns' && allImages.length > 0"),
    );
    const block = twoCols.slice(0, twoCols.indexOf("layout === 'stacked'"));
    expect(block).not.toMatch(/data-product-thumb\b/);
  });
});
