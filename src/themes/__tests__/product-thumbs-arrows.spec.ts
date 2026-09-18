/**
 * Стрелки ленты миниатюр в секции «Товар» действительно листают.
 *
 * Жалоба владельца 18.09, дословно: «Секция товар в макете Карусель и
 * Миниатюрный не работают слайдеры стрелочки».
 *
 * ЗАМЕР ДО: кнопки «Назад»/«Вперёд» рисуются в
 * `packages/theme-base/blocks/Product/ProductGallery.astro` (макеты
 * `carousel` и `thumbnail`, атрибуты `data-thumbs-prev`/`data-thumbs-next`),
 * а обработчика клика у них не было НИ ОДНОГО во всём репозитории — поиск по
 * `packages`, `themes` и `src` давал только саму разметку. То есть в четырёх
 * темах, которые рисуют товар общим блоком (rose, vanilla, satin, bloom),
 * стрелки были мёртвой вёрсткой. У flux собственный порт со своей стрелкой,
 * и там работала только «вперёд» (`data-cfg-thumbs-next`), кнопки «назад» не
 * было вовсе.
 *
 * Сторожим ПОВЕДЕНИЕ: поднимаем настоящую функцию `wireThumbsArrows` из
 * исходника порта (как это делает product-media-order.spec.ts для
 * переключения медиа) и кликаем по стрелкам на мини-DOM. Лента обязана
 * сдвинуться, а с последней позиции — вернуться в начало.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

const SITES_ROOT = join(__dirname, "..", "..", "..");
const THEME_BASE_PRODUCT = join(SITES_ROOT, "packages/theme-base/blocks/Product/Product.astro");

/** Мини-DOM: ровно то, чем пользуется обработчик, и ничего сверх. */
class El {
  tag: string;
  attrs: Record<string, string>;
  children: El[] = [];
  parentElement: El | null = null;
  listeners: Record<string, Array<() => void>> = {};
  scrollLeft = 0;
  scrollTop = 0;
  scrollWidth = 0;
  scrollHeight = 0;
  clientWidth = 0;
  clientHeight = 0;
  box = { width: 88, height: 88 };

  constructor(tag: string, attrs: Record<string, string> = {}) {
    this.tag = tag;
    this.attrs = attrs;
  }
  append(...kids: El[]): El {
    for (const k of kids) {
      k.parentElement = this;
      this.children.push(k);
    }
    return this;
  }
  private all(): El[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  private matches(sel: string): boolean {
    const attr = /^\[([a-z-]+)\]$/.exec(sel);
    return attr ? attr[1] in this.attrs : false;
  }
  querySelector(sel: string): El | null {
    return this.all().find((e) => e.matches(sel)) ?? null;
  }
  querySelectorAll(sel: string): El[] {
    return this.all().filter((e) => e.matches(sel));
  }
  getBoundingClientRect() {
    return this.box;
  }
  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  click(): void {
    (this.listeners.click ?? []).forEach((fn) => fn());
  }
  scrollTo(opts: { left?: number; top?: number }): void {
    if (typeof opts.left === "number") this.scrollLeft = opts.left;
    if (typeof opts.top === "number") this.scrollTop = opts.top;
  }
}

function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) {
    throw new Error(
      `в порте нет функции ${name}(…) — обработчик стрелок обязан быть именованным, иначе его нечем сторожить`,
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

const loadWiring = (): ((root: El) => void) => {
  const fnSrc = extractFunction(readFileSync(THEME_BASE_PRODUCT, "utf8"), "wireThumbsArrows");
  const js = ts.transpileModule(fnSrc, {
    compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.ESNext },
  }).outputText;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${js}; return wireThumbsArrows;`)() as (root: El) => void;
};

/** Лента из шести миниатюр: видно три, значит прокрутка есть. */
function gallery(axis: "horizontal" | "vertical") {
  const track = new El("div");
  for (let i = 0; i < 6; i++) {
    track.append(new El("button", { "data-product-thumb": "", "data-media-index": String(i) }));
  }
  if (axis === "horizontal") {
    track.clientWidth = 300;
    track.scrollWidth = 600;
    track.clientHeight = 88;
    track.scrollHeight = 88;
  } else {
    track.clientHeight = 300;
    track.scrollHeight = 600;
    track.clientWidth = 88;
    track.scrollWidth = 88;
  }
  const prev = new El("button", { "data-thumbs-prev": "" });
  const next = new El("button", { "data-thumbs-next": "" });
  const strip = new El("div", { "data-product-thumbs": "" }).append(prev, track, next);
  const root = new El("div").append(strip);
  return { root, track, prev, next };
}

describe("стрелки ленты миниатюр листают её", () => {
  it("горизонтальная лента: «вперёд» сдвигает, «назад» возвращает", () => {
    const { root, track, prev, next } = gallery("horizontal");
    loadWiring()(root);

    expect(track.scrollLeft).toBe(0);
    next.click();
    expect(track.scrollLeft).toBeGreaterThan(0);

    const afterNext = track.scrollLeft;
    prev.click();
    expect(track.scrollLeft).toBeLessThan(afterNext);
  });

  it("вертикальная лента (десктоп): двигается по вертикали, а не по горизонтали", () => {
    const { root, track, next } = gallery("vertical");
    loadWiring()(root);

    next.click();
    expect({ вертикаль: track.scrollTop > 0, горизонталь: track.scrollLeft }).toEqual({
      вертикаль: true,
      горизонталь: 0,
    });
  });

  it("с конца лента возвращается в начало, а не упирается", () => {
    const { root, track, next } = gallery("horizontal");
    loadWiring()(root);

    track.scrollLeft = track.scrollWidth - track.clientWidth; // самый край
    next.click();
    expect(track.scrollLeft).toBe(0);
  });

  it("САБОТАЖ: без обработчика клик ничего не делает — значит тест мерит именно его", () => {
    const { track, next } = gallery("horizontal");
    // wireThumbsArrows намеренно НЕ вызываем
    next.click();
    expect(track.scrollLeft).toBe(0);
  });
});
