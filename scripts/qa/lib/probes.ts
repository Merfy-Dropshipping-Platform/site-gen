/**
 * Зонды: цвет мишени, её цепочка предков, геометрия, переполнение.
 *
 * Все зонды передают в браузер ФУНКЦИЮ, а не строку кода: внутри шаблонной
 * строки `\d` схлопывается в `d`, и регулярка уезжает в браузер сломанной
 * (`/^-\d+%$/` → `/^-d+%$/`, «узлы не находятся», хотя они в DOM).
 *
 * Мишень всегда адресуется МАРКЕРОМ (см. markers.ts). «Первый подходящий узел»
 * как способ отбора здесь не предусмотрен вовсе.
 */
import { markerSelector, type Marker } from "./markers";
import type { Stage } from "./stage";

export const TRANSPARENT = "rgba(0, 0, 0, 0)";

export type ChainStep = {
  step: number;
  tag: string;
  id: string | null;
  cls: string;
  backgroundColor: string;
  opaque: boolean;
};

export type ColorProbe = {
  selector: string;
  found: boolean;
  /**
   * Сколько узлов совпало с маркером. Больше одного — маркер НЕОДНОЗНАЧЕН, и
   * замер первого снова становится отбором наугад (у flux «Товар» две ветки
   * раскладки, `data-cfg-name` стоит на обеих).
   */
  matched: number;
  /** Вычисленное значение запрошенного свойства на самой мишени. */
  value: string | null;
  /**
   * Что видит глаз: первая НЕПРОЗРАЧНАЯ заливка вверх по дереву.
   * Поле поиска прозрачно, а цвет несёт форма-обёртка — без этого замер врёт
   * в обе стороны.
   */
  effective: string | null;
  /** Кто красит: `сама мишень` | `предок #N` | `страница` | null. */
  painter: string | null;
  chain: ChainStep[];
  /** Классы мишени — на них потом смотрит проверка «класс-призрак». */
  classes: string[];
};

/** Цвет мишени плюс ЦЕПОЧКА предков с их фонами. */
export async function probeColor(
  stage: Stage,
  marker: Marker | string,
  prop: "background-color" | "color" | string = "background-color",
  opts: { nth?: number } = {},
): Promise<ColorProbe> {
  const selector = markerSelector(marker);
  return stage.page.evaluate(
    ({ selector: sel, prop: p, nth }) => {
      const T = "rgba(0, 0, 0, 0)";
      const nodes = Array.from(document.querySelectorAll(sel));
      const el = nodes[nth ?? 0] as HTMLElement | undefined;
      if (!el) {
        return {
          selector: sel,
          found: false,
          matched: nodes.length,
          value: null,
          effective: null,
          painter: null,
          chain: [],
          classes: [],
        };
      }
      const chain: Array<{
        step: number;
        tag: string;
        id: string | null;
        cls: string;
        backgroundColor: string;
        opaque: boolean;
      }> = [];
      let node: HTMLElement | null = el;
      let step = 0;
      let effective: string | null = null;
      let painter: string | null = null;
      while (node) {
        const cs = getComputedStyle(node);
        const bg = cs.backgroundColor;
        const opaque = Boolean(bg) && bg !== T && !/rgba\([^)]*,\s*0\s*\)$/.test(bg);
        chain.push({
          step,
          tag: node.tagName.toLowerCase(),
          id: node.id || null,
          cls: (node.getAttribute("class") || "").slice(0, 160),
          backgroundColor: bg,
          opaque,
        });
        if (opaque && effective === null) {
          effective = bg;
          painter =
            step === 0
              ? "сама мишень"
              : node === document.body || node === document.documentElement
                ? "страница"
                : `предок #${step}`;
        }
        node = node.parentElement;
        step += 1;
      }
      return {
        selector: sel,
        found: true,
        matched: nodes.length,
        value: getComputedStyle(el).getPropertyValue(p).trim() || null,
        effective,
        painter,
        chain,
        classes: (el.getAttribute("class") || "").split(/\s+/).filter(Boolean),
      };
    },
    { selector, prop, nth: opts.nth ?? 0 },
  );
}

export type GeometryProbe = {
  selector: string;
  found: boolean;
  /** Сколько узлов совпало с маркером (>1 — маркер неоднозначен). */
  matched: number;
  x: number | null;
  right: number | null;
  width: number | null;
  height: number | null;
  paddingLeft: number | null;
  paddingRight: number | null;
  paddingTop: number | null;
  paddingBottom: number | null;
  marginLeft: string | null;
  marginRight: string | null;
  maxWidth: string | null;
  columnGap: string | null;
  rowGap: string | null;
  display: string | null;
  gridTemplateColumns: string | null;
  /** Боковое поле = x мишени; для контейнера внутри секции это его отступ. */
  classes: string[];
};

/** Геометрия мишени: где стоит, какой ширины, какие поля и зазоры. */
export async function probeGeometry(
  stage: Stage,
  marker: Marker | string,
  opts: { nth?: number } = {},
): Promise<GeometryProbe> {
  const selector = markerSelector(marker);
  return stage.page.evaluate(
    ({ selector: sel, nth }) => {
      const px = (v: string): number | null => {
        const n = Number.parseFloat(v);
        return Number.isNaN(n) ? null : n;
      };
      const nodes = Array.from(document.querySelectorAll(sel));
      const el = nodes[nth ?? 0] as HTMLElement | undefined;
      if (!el) {
        return {
          selector: sel,
          found: false,
          matched: nodes.length,
          x: null,
          right: null,
          width: null,
          height: null,
          paddingLeft: null,
          paddingRight: null,
          paddingTop: null,
          paddingBottom: null,
          marginLeft: null,
          marginRight: null,
          maxWidth: null,
          columnGap: null,
          rowGap: null,
          display: null,
          gridTemplateColumns: null,
          classes: [],
        };
      }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        selector: sel,
        found: true,
        matched: nodes.length,
        x: Math.round(r.x * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        paddingLeft: px(cs.paddingLeft),
        paddingRight: px(cs.paddingRight),
        paddingTop: px(cs.paddingTop),
        paddingBottom: px(cs.paddingBottom),
        marginLeft: cs.marginLeft,
        marginRight: cs.marginRight,
        maxWidth: cs.maxWidth,
        columnGap: cs.columnGap,
        rowGap: cs.rowGap,
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        classes: (el.getAttribute("class") || "").split(/\s+/).filter(Boolean),
      };
    },
    { selector, nth: opts.nth ?? 0 },
  );
}

export type OverflowProbe = {
  selector: string;
  found: boolean;
  /** ЗАДАННАЯ ширина окна — неподвижная опора. */
  reference: number;
  left: number | null;
  right: number | null;
  /** На сколько пикселей мишень вылезла за правый край окна. */
  overRight: number | null;
  overLeft: number | null;
  documentScrollWidth: number | null;
};

/**
 * Переполнение мишени относительно ЗАДАННОЙ ширины окна.
 *
 * `window.innerWidth` растёт вместе с выходом контента за край и прячет баг —
 * поэтому опора берётся из сцены, а не из браузера.
 */
export async function probeOverflow(
  stage: Stage,
  marker: Marker | string,
  opts: { nth?: number } = {},
): Promise<OverflowProbe> {
  const selector = markerSelector(marker);
  const raw = await stage.page.evaluate(
    ({ selector: sel, nth }) => {
      const el = Array.from(document.querySelectorAll(sel))[nth ?? 0] as HTMLElement | undefined;
      if (!el) return { found: false, left: null, right: null, doc: document.documentElement.scrollWidth };
      const r = el.getBoundingClientRect();
      return {
        found: true,
        left: Math.round(r.left * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        doc: document.documentElement.scrollWidth,
      };
    },
    { selector, nth: opts.nth ?? 0 },
  );
  const reference = stage.declaredWidth;
  return {
    selector,
    found: raw.found,
    reference,
    left: raw.left,
    right: raw.right,
    overRight: raw.right === null ? null : Math.round((raw.right - reference) * 100) / 100,
    overLeft: raw.left === null ? null : Math.round(-raw.left * 100) / 100,
    documentScrollWidth: raw.doc,
  };
}

export type GeometryDiffRow = {
  key: string;
  actual: unknown;
  reference: unknown;
  same: boolean;
};

/** Сравнение той же клетки с эталоном (обычно rose). */
export function compareGeometry(
  actual: GeometryProbe,
  reference: GeometryProbe,
  keys: Array<keyof GeometryProbe> = [
    "x",
    "width",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "maxWidth",
    "columnGap",
    "rowGap",
  ],
): GeometryDiffRow[] {
  return keys.map((key) => ({
    key: String(key),
    actual: actual[key],
    reference: reference[key],
    same: JSON.stringify(actual[key]) === JSON.stringify(reference[key]),
  }));
}
