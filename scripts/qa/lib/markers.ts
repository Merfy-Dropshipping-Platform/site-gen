/**
 * Мишень задаётся МАРКЕРОМ, а не «первым подходящим узлом».
 *
 * Зачем модуль. Отбор «первая непустая ссылка в строке товара» возвращал у flux
 * ссылку-ПРЕВЬЮ (значок скидки лежит внутри неё) вместо названия товара — замер
 * шёл не по тому узлу и врал молча. Второй случай той же болезни: текстовая
 * регулярка `data-cfg-thumb` без границы ловила `data-cfg-thumbs-track`, и
 * «плитка» мерилась по ЛЕНТЕ.
 *
 * Здесь оба случая закрыты устройством, а не бдительностью:
 *   • узел ищется настоящим CSS-селектором (у селектора атрибута нет проблемы
 *     границы — `[data-cfg-thumb]` никогда не совпадёт с `data-cfg-thumbs-track`);
 *   • разметка разбирается парсером, а не регуляркой по тексту;
 *   • узел не найден — падаем громко, «возьмём соседний» не бывает.
 */
import { parse, type HTMLElement } from "node-html-parser";

/** Классы узла. */
export const classesOf = (el: HTMLElement): string[] =>
  (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

export type Marker =
  /** `[data-block="cart-body"]` — корень блока темы. */
  | { kind: "block"; value: string }
  /** `[data-cfg-name]` или `[data-nt="promo-banner"]`. */
  | { kind: "attr"; name: string; value?: string }
  | { kind: "id"; value: string }
  /** Сырой селектор — запасной выход, когда маркера у узла нет. */
  | { kind: "css"; value: string };

/**
 * Строка мишени из командной строки/таблицы кейсов.
 *
 *   block:cart-body            → [data-block="cart-body"]
 *   attr:data-cfg-name         → [data-cfg-name]
 *   attr:data-nt=promo-banner  → [data-nt="promo-banner"]
 *   #cart-title                → #cart-title
 *   css:.flux-container        → .flux-container
 *   data-block="cart-body"     → [data-block="cart-body"]   (форма из старых гардов)
 *   id="cart-title"            → #cart-title                (форма из старых гардов)
 */
export function parseMarker(spec: string): Marker {
  const s = spec.trim();
  if (s.startsWith("block:")) return { kind: "block", value: s.slice(6) };
  if (s.startsWith("attr:")) {
    const [name, ...rest] = s.slice(5).split("=");
    const value = rest.join("=").replace(/^["']|["']$/g, "");
    return value ? { kind: "attr", name, value } : { kind: "attr", name };
  }
  if (s.startsWith("css:")) return { kind: "css", value: s.slice(4) };
  if (s.startsWith("#")) return { kind: "id", value: s.slice(1) };
  // Формы, в которых маркеры записаны в уже существующих гардах.
  const idEq = /^id=["']?([^"'\s]+)["']?$/.exec(s);
  if (idEq) return { kind: "id", value: idEq[1] };
  const attrEq = /^(data-[a-z0-9-]+)=["']?([^"']+)["']?$/.exec(s);
  if (attrEq) return { kind: "attr", name: attrEq[1], value: attrEq[2] };
  if (/^data-[a-z0-9-]+$/.test(s)) return { kind: "attr", name: s };
  return { kind: "css", value: s };
}

/** Маркер → CSS-селектор. */
export function markerSelector(m: Marker | string): string {
  const marker = typeof m === "string" ? parseMarker(m) : m;
  switch (marker.kind) {
    case "block":
      return `[data-block="${marker.value}"]`;
    case "attr":
      return marker.value === undefined
        ? `[${marker.name}]`
        : `[${marker.name}="${marker.value}"]`;
    case "id":
      return `#${marker.value}`;
    case "css":
      return marker.value;
  }
}

/**
 * ВСЕ узлы по маркеру.
 *
 * Их бывает больше одного: у flux «Товар» две ветки раскладки, и `data-cfg-name`
 * стоит на ОБОИХ заголовках. Замер только первого — снова отбор наугад: саботаж
 * второго узла (литерал вместо токена) оставлял проверку зелёной. Поэтому
 * количество совпадений здесь возвращается явно, а гарды обязаны решить, что с
 * ним делать.
 */
export function nodesOfMarker(root: HTMLElement, m: Marker | string): HTMLElement[] {
  const sel = markerSelector(m);
  const found = root.querySelectorAll(sel) as unknown as HTMLElement[];
  if (found.length > 0) return [...found];
  return root.matches?.(sel) ? [root] : [];
}

/** Узел по маркеру. Нет узла — громкая ошибка. `nth` — какой из совпавших. */
export function nodeOfMarker(
  root: HTMLElement,
  m: Marker | string,
  opts: { nth?: number } = {},
): HTMLElement {
  const sel = markerSelector(m);
  const all = nodesOfMarker(root, m);
  const el = all[opts.nth ?? 0];
  if (!el) {
    throw new Error(
      all.length === 0
        ? `узел ${sel} в разметке не найден`
        : `узла ${sel} №${opts.nth} нет: совпало ${all.length}`,
    );
  }
  return el;
}

/** Сколько узлов совпало с маркером. 0 — мишени нет, >1 — маркер неоднозначен. */
export const markerCount = (html: string, m: Marker | string): number =>
  nodesOfMarker(parse(html), m).length;

/** Классы узла, помеченного маркером (`nth` — какой из совпавших). */
export function classesOfMarker(
  html: string,
  m: Marker | string,
  opts: { nth?: number } = {},
): string[] {
  return classesOf(nodeOfMarker(parse(html), m, opts));
}

/**
 * Классы КАЖДОГО узла, совпавшего с маркером.
 *
 * Гарду почти всегда нужен именно этот список: мишень «заголовок товара» живёт
 * в двух ветках раскладки, и обе обязаны быть покрашены одинаково.
 */
export function classesOfAllMarker(html: string, m: Marker | string): string[][] {
  const all = nodesOfMarker(parse(html), m);
  if (all.length === 0) throw new Error(`узел ${markerSelector(m)} в разметке не найден`);
  return all.map(classesOf);
}

/** Дети-элементы (без текстовых узлов). */
export const elementChildren = (el: HTMLElement): HTMLElement[] =>
  el.childNodes.filter(
    (n): n is HTMLElement => (n as HTMLElement).tagName !== undefined,
  );

/** Корень блока в отрисованной секции (Puck-обёртка или первый элемент). */
export function blockRoot(html: string): HTMLElement {
  const doc = parse(html);
  const puck = doc.querySelector("[data-puck-component-id]");
  if (puck) return puck;
  const SKIP = new Set(["STYLE", "SCRIPT", "LINK", "TEMPLATE", "META"]);
  for (const el of elementChildren(doc)) {
    if (!SKIP.has(el.tagName)) return el;
  }
  throw new Error("в разметке нет ни одного отрисовываемого узла");
}

export type { HTMLElement };
export { parse };
