/**
 * Что проверить после правки магазина новой темы — по адресам изменений
 * ревизии (`changes`, их считает `save-on-base.ts`) и документу после правки.
 *
 * Решение владельца 16.11: «поменялась только одна секция, а у меня вся
 * страница… весь сайт проверялся». Правка одной-трёх секций — проверяем только
 * их; шапку и подвал — сами, один раз, а не каждую страницу; новую страницу —
 * все её секции; тема меняет вид, а не разметку. Мерчант может не знать, что
 * правит секции, — понимает это платформа, по адресам изменений.
 *
 * Адреса — движок операций (`operations/README.md`). Сборка витрины новой темы
 * читает из черновика `sections`, `menus`, `tokens`, `settings` и `pages`
 * (`packages/storefront-builder/src/snapshot.ts`); прочие адреса (документ пяти
 * тем `page:…`, служебные поля) на вид витрины новой темы не влияют и в итог не
 * попадают.
 */
import { parseSegment, splitPath } from "./operations/address";
import { isPlainObject } from "./operations/json";
import { SHARED_LISTS } from "../store/skeleton/skeleton-layout";

/** Секция на странице. У шапки, подвала и «поверх страниц» страница — имя списка: `header`, `footer`, `overlay`. */
export interface CheckSection {
  page: string;
  id: string;
}

/** Страница, где правила страницы (один h1, порядок заголовков, SEO-теги) надо проверить заново. */
export interface CheckPage {
  page: string;
  /** Страница новая или заменена целиком: проверить все её секции. */
  whole: boolean;
}

export interface CheckScope {
  /** Секции, которые правка добавила или поменяла и которые видны. По одному разу, в порядке адресов. */
  sections: CheckSection[];
  /**
   * Страницы, где поменялся состав без видимой изменённой секции (секцию
   * убрали, скрыли, переставили), поменялись имя, адрес или SEO — или
   * страница новая. Страницу с изменённой секцией сюда не пишем: правила
   * страницы проверяющий гоняет и так, вместе с секцией.
   */
  pages: CheckPage[];
  /** Поменялась тема — токены или настройки темы: меняется вид секций, разметка та же. */
  theme: boolean;
}

/** Списки, которые показаны на каждой странице. */
const SHARED: ReadonlySet<string> = new Set(Object.keys(SHARED_LISTS));
/** Где стоят меню: правка меню меняет шапку и подвал. */
const MENU_LISTS = ["header", "footer"] as const;
/** Ключи ревизии с правками темы. */
const THEME_KEYS: ReadonlySet<string> = new Set(["tokens", "settings"]);

type Instance = { id?: unknown; hidden?: unknown };

function sectionLists(doc: unknown): Record<string, Instance[]> {
  if (!isPlainObject(doc) || !isPlainObject(doc.sections)) return {};
  const lists: Record<string, Instance[]> = {};
  for (const [page, list] of Object.entries(doc.sections)) {
    if (Array.isArray(list)) lists[page] = list.filter(isPlainObject);
  }
  return lists;
}

function pageIds(doc: unknown): Set<string> {
  if (!isPlainObject(doc) || !Array.isArray(doc.pages)) return new Set();
  return new Set(
    doc.pages
      .map((page) => (isPlainObject(page) ? page.id : undefined))
      .filter((id): id is string => typeof id === "string"),
  );
}

/** Собирает итог: повторы секций и страниц схлопываются, `whole` у страницы — если хоть один адрес так сказал. */
class Collector {
  private readonly sections = new Map<string, CheckSection>();
  private readonly pages = new Map<string, CheckPage>();
  private theme = false;

  constructor(
    private readonly lists: Record<string, Instance[]>,
    private readonly known: Set<string>,
  ) {}

  private visible(page: string, id: string): boolean {
    const found = this.lists[page]?.find((instance) => instance.id === id);
    return found !== undefined && found.hidden !== true;
  }

  private exists(page: string): boolean {
    return page in this.lists || this.known.has(page);
  }

  section(page: string, id: string): void {
    if (!this.visible(page, id)) {
      // Секцию убрали или скрыли: смотреть нечего, но состав страницы другой.
      // Шапка и подвал на каждой странице — правил одной страницы тут нет.
      if (!SHARED.has(page)) this.page(page, false);
      return;
    }
    this.sections.set(`${page}\u0000${id}`, { page, id });
  }

  /** Все видимые секции списка — для шапки и подвала целиком. */
  list(page: string): void {
    for (const instance of this.lists[page] ?? []) {
      if (typeof instance.id === "string") this.section(page, instance.id);
    }
  }

  page(page: string, whole: boolean): void {
    if (!this.exists(page)) return;
    const prev = this.pages.get(page);
    this.pages.set(page, { page, whole: whole || prev?.whole === true });
  }

  markTheme(): void {
    this.theme = true;
  }

  result(): CheckScope {
    const withSection = new Set(
      [...this.sections.values()].map((section) => section.page),
    );
    return {
      sections: [...this.sections.values()],
      pages: [...this.pages.values()].filter(
        (page) => page.whole || !withSection.has(page.page),
      ),
      theme: this.theme,
    };
  }
}

/** `sections/…`: страница, секция или порядок. */
function sectionsAddress(rest: string[], into: Collector, all: string[]): void {
  const [pageSegment, itemSegment] = rest;
  if (pageSegment === undefined) {
    // Все списки разом — каждая страница целиком.
    all.forEach((page) =>
      SHARED.has(page) ? into.list(page) : into.page(page, true),
    );
    return;
  }
  const page = keyOf(pageSegment);
  if (page === null) return;
  const item =
    itemSegment === undefined ? undefined : parseSegment(itemSegment);
  if (SHARED.has(page)) {
    // Шапку и подвал смотрим целиком, если поменялся сам список или порядок в нём.
    if (item === undefined || item.kind === "order") into.list(page);
    else if (item.kind === "key") into.section(page, item.key);
    return;
  }
  if (item === undefined) into.page(page, true);
  else if (item.kind === "order") into.page(page, false);
  else if (item.kind === "key") into.section(page, item.key);
}

/** `pages/…`: мета страницы. Элемент целиком — новая страница, поле — имя, адрес или SEO. */
function pagesAddress(rest: string[], into: Collector): void {
  const [idSegment, field] = rest;
  if (idSegment === undefined) return;
  const id = keyOf(idSegment);
  if (id === null) return;
  into.page(id, field === undefined);
}

function keyOf(segment: string): string | null {
  const parsed = parseSegment(segment);
  return parsed.kind === "key" ? parsed.key : null;
}

/** Проверять нечего: итога нет, или в нём ни секций, ни страниц, ни темы. */
export function isEmptyScope(scope: CheckScope | null): boolean {
  return (
    scope === null ||
    (scope.sections.length === 0 && scope.pages.length === 0 && !scope.theme)
  );
}

export function checkScope(
  changes: readonly string[],
  after: unknown,
): CheckScope {
  const lists = sectionLists(after);
  const into = new Collector(lists, pageIds(after));
  for (const address of changes) {
    const [head, ...rest] = splitPath(address);
    const key = head === undefined ? null : keyOf(head);
    if (key === "sections") sectionsAddress(rest, into, Object.keys(lists));
    else if (key === "pages") pagesAddress(rest, into);
    else if (key === "menus") MENU_LISTS.forEach((list) => into.list(list));
    else if (key !== null && THEME_KEYS.has(key)) into.markTheme();
  }
  return into.result();
}
