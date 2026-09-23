/**
 * «Группа товаров» темы в jsdom — общий стенд гардов фильтров каталога.
 *
 * Секция рендерится настоящим рендером темы (scripts/qa/lib/render), её
 * скрипты исполняются в jsdom (в CI браузера нет), витринное API магазина
 * подменено данными теста: коллекции (/api/store/collections), цвета (группа
 * «Цвет» в /api/store/filters), товары (/api/store/products; по умолчанию их
 * нет). Каждый запрос за товарами копится в `запросыТоваров` — по нему видно,
 * что каталог попросил у сервера.
 *
 * Вынесено из catalog-filters-sheet.spec.ts 23.09, когда тот же стенд
 * понадобился гардам «Коллекций» и «Цвета» в шторке и шрифта фильтров:
 * три копии разъехались бы.
 *
 * Спека, которая берёт стенд, объявляет `@jest-environment jsdom`, зовёт
 * `поставитьСтенд()` в beforeAll и `снять()` в afterAll.
 */
import { renderSections } from "../../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../../common/block-root-inline";

export type Тема = "bloom" | "satin" | "flux" | "rose" | "vanilla";
export const ТЕМЫ: Тема[] = ["bloom", "satin", "flux", "rose", "vanilla"];

/** Что витринное API отдаёт про магазин. Без полей — пустой магазин. */
export interface Магазин {
  коллекции?: Array<{
    id: string;
    title: string;
    slug: string;
    /** «Общая» коллекция магазина (product: ensureDefaultCollection). */
    isDefault?: boolean;
  }>;
  /** Содержимое `/data/collections.json` сайта; нет — файла нет (404). */
  файлКоллекций?: unknown;
  /** Значения группы «Цвет» у товаров магазина. */
  цвета?: string[];
  /** Товары в форме /api/store/products (title, slug, basePrice, images…). */
  товары?: Array<Record<string, unknown>>;
}

/** Адреса запросов за товарами (раскодированные) — с последнего `показать`. */
export const запросыТоваров: string[] = [];

let магазин: Магазин = {};
const рендеры = new Map<string, string>();
const тик = () => new Promise((r) => setTimeout(r, 0));

type Слушатель = {
  цель: EventTarget;
  тип: string;
  fn: EventListenerOrEventListenerObject;
  opts?: unknown;
};
const повешенные: Слушатель[] = [];
let поставлен = false;

function ответ(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const нет404 = {
  ok: false,
  status: 404,
  json: async () => null,
  text: async () => "",
} as unknown as Response;

async function витрина(input: RequestInfo | URL): Promise<Response> {
  const адрес = String(input);
  if (адрес.includes("/data/collections.json"))
    return магазин.файлКоллекций === undefined
      ? нет404
      : ответ(магазин.файлКоллекций);
  if (адрес.includes("/api/store/collections"))
    return ответ({ collections: магазин.коллекции ?? [] });
  if (адрес.includes("/api/store/filters"))
    return ответ({
      success: true,
      data: {
        groups: магазин.цвета ? [{ name: "Цвет", values: магазин.цвета }] : [],
      },
    });
  if (адрес.includes("/api/store/products")) {
    запросыТоваров.push(decodeURIComponent(адрес));
    const товары = магазин.товары ?? [];
    return ответ({ products: товары, total: товары.length });
  }
  return ответ({
    data: [],
    items: [],
    products: [],
    total: 0,
    collections: [],
  });
}

/**
 * Слушатели документа и окна запоминаются, чтобы `снять()` убрал их перед
 * следующим показом: иначе обработчики прошлой темы ловили бы клики новой.
 */
export function поставитьСтенд(): void {
  if (поставлен) return;
  поставлен = true;
  const origDoc = document.addEventListener.bind(document);
  const origWin = window.addEventListener.bind(window);
  document.addEventListener = ((
    тип: string,
    fn: EventListenerOrEventListenerObject,
    opts?: unknown,
  ) => {
    повешенные.push({ цель: document, тип, fn, opts });
    origDoc(тип, fn, opts as AddEventListenerOptions);
  }) as typeof document.addEventListener;
  window.addEventListener = ((
    тип: string,
    fn: EventListenerOrEventListenerObject,
    opts?: unknown,
  ) => {
    повешенные.push({ цель: window, тип, fn, opts });
    origWin(тип, fn, opts as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  (window as unknown as { fetch: unknown }).fetch = витрина;
  (globalThis as unknown as { fetch: unknown }).fetch = витрина;
}

/** Чистая страница: без слушателей, глобалов `__merfy*`, замка и `?query`. */
export function снять(): void {
  for (const s of повешенные.splice(0))
    s.цель.removeEventListener(s.тип, s.fn, s.opts as EventListenerOptions);
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy"))
      delete (window as unknown as Record<string, unknown>)[k];
  }
  for (const a of Array.from(document.body.attributes))
    document.body.removeAttribute(a.name);
  document.documentElement.style.overflow = "";
  document.body.innerHTML = "";
  window.history.replaceState({}, "", "/");
}

/** Дать скриптам секции доработать: запросы API и перерисовки — промисы. */
export async function дождаться(): Promise<void> {
  for (let i = 0; i < 40; i++) await тик();
}

/**
 * Показать секцию «Группа товаров» темы. `новаяСтраница: false` — перерисовка
 * блока в превью конструктора: слушатели, флажки и глобалы остаются.
 */
export function показать(
  тема: Тема,
  props: Record<string, unknown> = {},
  новаяСтраница = true,
  м: Магазин = {},
): Promise<HTMLElement> {
  return показатьБлок(
    тема,
    "Catalog",
    {
      siteId: "site-1",
      colorScheme: "scheme-1",
      cards: 4,
      columns: 2,
      showFilter: "true",
      showSort: "true",
      filterPosition: "top",
      ...props,
    },
    новаяСтраница,
    м,
  );
}

/** Показать любой блок темы (id `<Блок>-1`) с его скриптами. */
export async function показатьБлок(
  тема: Тема,
  блок: string,
  props: Record<string, unknown> = {},
  новаяСтраница = true,
  м: Магазин = {},
): Promise<HTMLElement> {
  if (новаяСтраница) {
    снять();
    магазин = м;
    запросыТоваров.length = 0;
    (0, eval)(BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, ""));
  }
  // Рендер секции — отдельный процесс, на показ уходят секунды: одинаковые
  // пропы рендерим один раз (скрипты всё равно исполняются заново).
  const ключ = `${тема} ${блок} ${JSON.stringify(props)}`;
  if (!рендеры.has(ключ)) {
    const [r] = renderSections(тема, [
      { block: блок, props: { id: `${блок}-1`, ...props } },
    ]);
    if (r.error) throw new Error(`${тема}: ${r.error}`);
    рендеры.set(ключ, r.html ?? "");
  }
  const html = рендеры.get(ключ) ?? "";
  const скрипты = [
    ...html.matchAll(
      /<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => m[1]);
  // Секция — внутри <main>, как на витрине: на это опираются правила
  // «Настроек темы» (tokens-css: `main button[class]` и т. п.).
  document.body.innerHTML = `<main>${html.replace(
    /<script[^>]*>[\s\S]*?<\/script>/g,
    "",
  )}</main>`;
  for (const код of скрипты) {
    try {
      (0, eval)(код);
    } catch {
      /* чужие узлы одиночного рендера */
    }
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await дождаться();
  const корень = document.querySelector<HTMLElement>(
    `[data-puck-component-id="${блок}-1"]`,
  );
  if (!корень) throw new Error(`${тема}: нет корня секции`);
  return корень;
}

export const нажать = (el: Element | null | undefined) =>
  el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

/**
 * Выбрать пункт так, как это делает покупатель: у кнопки — нажатие, у радио
 * (vanilla рисует коллекции и цвет радио) — отметка и `change`, как после
 * нажатия по его подписи.
 */
export function выбрать(el: Element | null | undefined): void {
  if (!el) throw new Error("нет пункта, который надо выбрать");
  if (el instanceof HTMLInputElement) {
    el.checked = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  нажать(el);
}

/** Выбран ли пункт: кнопка — `aria-pressed`, радио — `checked`. */
export const выбран = (el: Element) =>
  el instanceof HTMLInputElement
    ? el.checked
    : el.getAttribute("aria-pressed") === "true";

/** Подпись пункта: у радио — текст его `<label>`. */
export const подпись = (el: Element) =>
  ((el.closest("label") ?? el).textContent ?? "").replace(/\s+/g, " ").trim();
