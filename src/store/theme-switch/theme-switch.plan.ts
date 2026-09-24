/**
 * План смены темы — чистая функция (этап 3, кусок 3.3; И4, долги Н3 и Н9).
 *
 * Вход: документ магазина (как его отдаёт порт `StoreContent.load`), канон
 * новой темы (`buildInitialRevision`) и канон прежней темы, приведённый к тому
 * же виду, что и документ (для ответа «что потеряно»). Выход: новый документ и
 * отчёт, который обязан совпадать с фактом нового документа.
 *
 * Правила (данные и ранние выходы, без веток «под тему»):
 *   - страницы темы — из канона новой темы (пересев), как и раньше в `update()`;
 *   - свои страницы мерчанта (`source: 'user'` / `isCustom`) переезжают с
 *     содержимым; меню магазина переезжает всегда (решение владельца 23.09);
 *   - Н3: своя страница, чей id или slug занят страницей новой темы, НЕ
 *     теряется, как было в `carryOverUserPages`, — она переезжает под
 *     свободным суффиксом (`/about` → `/about-1`), а пункты меню, что вели на
 *     неё, ведут туда же; отчёт это называет;
 *   - Н9: перенесённая страница — в полной форме: метаданные страницы
 *     (`role/isCustom/source` и зарезервированные поля) и Puck-дерево
 *     `{content, root, zones}`; легаси `{text}` становится секцией «Страница»
 *     между шапкой и подвалом новой темы (как `pages.service` создаёт страницу);
 *   - «потеряно» — страницы темы, у которых тело (неслужебные блоки без id)
 *     отличается от канона прежней темы: правки мерчанта, которые пересев
 *     заменяет. До провенанса этапа 2 это сравнение с сидом, в отчёте так и
 *     написано (`lostDetection: 'seed-compare'`).
 */

// Служебные блоки-обёртки (шапка, подвал, промо-баннер): общие для всех
// страниц, правкой страницы не считаются — тот же набор, что у фильтра записи B17.
import { CHROME_TYPES } from "../../utils/revision-write-filter";
import { emptyPageBlock } from "../../pages/page-section";

type Json = Record<string, any>;

export interface ThemeSwitchInput {
  /** Документ магазина сейчас (порт `load`); `null` — ревизии ещё нет. */
  previous: Json | null;
  /** Канон новой темы. */
  canon: Json;
  /** Канон прежней темы в том же виде, что `previous`; `null` — не с чем сравнить. */
  previousCanon: Json | null;
}

export type RenameReason =
  | "id_taken_by_theme_page"
  | "slug_taken_by_theme_page";
export type LostReason = "merchant_edits_on_theme_page" | "theme_page_dropped";

export interface ThemeSwitchReport {
  carried: {
    pages: Array<{ id: string; slug: string; name: string }>;
    menu: { links: number } | null;
  };
  renamed: Array<{
    pageId: string;
    fromId: string;
    toId: string;
    fromSlug: string;
    toSlug: string;
    reason: RenameReason;
  }>;
  normalized: Array<{ pageId: string; from: "legacy" }>;
  menuLinksRewritten: Array<{ from: string; to: string; count: number }>;
  reseeded: { pages: Array<{ id: string; slug: string }> };
  dropped: Array<{ pageId: string; slug: string }>;
  lost: Array<{
    pageId: string;
    slug: string;
    name: string;
    reason: LostReason;
  }>;
  /**
   * Как определено «потеряно»: сравнением с каноном прежней темы, или
   * `unavailable` — канона прежней темы нет (тема магазина без пакета), и
   * тогда «потеряно» не угадывается, а отчёт честно пустой.
   */
  lostDetection: "seed-compare" | "unavailable";
}

export interface ThemeSwitchPlan {
  document: Json;
  report: ThemeSwitchReport;
}

/** Зарезервированные поля метаданных страницы (`RevisionPage`). */
const RESERVED_PAGE_FIELDS = [
  "seo",
  "locale",
  "variant",
  "schedule",
  "permissions",
  "targeting",
] as const;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isUserPage(page: Json): boolean {
  return page.source === "user" || page.isCustom === true;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, stable(value[k])]),
  );
}

/** Отпечаток тела страницы: неслужебные блоки без `props.id` (как фильтр записи B17). */
export function pageBodyFingerprint(page: unknown): string {
  if (!isObject(page)) return JSON.stringify(null);
  if (!Array.isArray(page.content)) return JSON.stringify(stable(page));
  const body = page.content
    .filter((b: Json) => b && !CHROME_TYPES.has(String(b.type)))
    .map((b: Json) => {
      const { id: _id, ...props } = isObject(b.props) ? b.props : {};
      return { type: b.type, props: stable(props) };
    });
  return JSON.stringify(body);
}

const EMPTY_BODY = JSON.stringify([]);

function freeSuffix(value: string, taken: Set<string>): string {
  for (let n = 1; ; n += 1) {
    const candidate = `${value}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Н3: куда переезжает своя страница
// ---------------------------------------------------------------------------

interface Placement {
  page: Json;
  toId: string;
  toSlug: string;
  reason: RenameReason | null;
}

function placeUserPages(userPages: Json[], canonPages: Json[]): Placement[] {
  const canonIds = new Set(canonPages.map((p) => String(p.id)));
  const canonSlugs = new Set(canonPages.map((p) => String(p.slug)));
  const collides = (p: Json) =>
    canonIds.has(String(p.id)) || canonSlugs.has(String(p.slug));
  // Занятое: канон + свои страницы, которые переезжают без переименования.
  const takenIds = new Set([
    ...canonIds,
    ...userPages.filter((p) => !collides(p)).map((p) => String(p.id)),
  ]);
  const takenSlugs = new Set([
    ...canonSlugs,
    ...userPages.filter((p) => !collides(p)).map((p) => String(p.slug)),
  ]);

  return userPages.map((page) => {
    if (!collides(page))
      return {
        page,
        toId: String(page.id),
        toSlug: String(page.slug),
        reason: null,
      };
    const idTaken = canonIds.has(String(page.id));
    const toId = idTaken
      ? freeSuffix(String(page.id), takenIds)
      : String(page.id);
    const toSlug = canonSlugs.has(String(page.slug))
      ? freeSuffix(String(page.slug), takenSlugs)
      : String(page.slug);
    takenIds.add(toId);
    takenSlugs.add(toSlug);
    return {
      page,
      toId,
      toSlug,
      reason: idTaken ? "id_taken_by_theme_page" : "slug_taken_by_theme_page",
    };
  });
}

// ---------------------------------------------------------------------------
// Н9: полная форма перенесённой страницы
// ---------------------------------------------------------------------------

function fullPageMeta(page: Json, id: string, slug: string): Json {
  const reserved = Object.fromEntries(
    RESERVED_PAGE_FIELDS.map((f) => [f, page[f] ?? null]),
  );
  return {
    ...page,
    id,
    name: typeof page.name === "string" && page.name ? page.name : id,
    slug,
    role: "custom",
    isCustom: true,
    source: "user",
    ...reserved,
  };
}

function legacyText(data: unknown): string {
  if (!isObject(data)) return "";
  if (typeof data.text === "string") return data.text;
  return typeof data.content === "string" ? data.content : "";
}

function chromeFromCanonHome(
  canon: Json,
  type: "Header" | "Footer",
  pageId: string,
): Json {
  const home = canon.pagesData?.home;
  const found = Array.isArray(home?.content)
    ? home.content.find((b: Json) => b?.type === type)
    : undefined;
  return found
    ? { ...found, props: { ...found.props, id: `${type}-${pageId}` } }
    : { type, props: { id: `${type}-${pageId}` } };
}

/** Puck-дерево страницы; `legacy: true` — дерево построено из легаси-данных. */
function fullPageData(
  data: unknown,
  pageId: string,
  title: string,
  canon: Json,
): { data: Json; legacy: boolean } {
  if (isObject(data) && Array.isArray(data.content)) {
    if (isObject(data.root) && isObject(data.zones))
      return { data, legacy: false };
    return {
      data: {
        ...data,
        root: isObject(data.root) ? data.root : { props: { title } },
        zones: isObject(data.zones) ? data.zones : {},
      },
      legacy: false,
    };
  }
  const content = [
    chromeFromCanonHome(canon, "Header", pageId),
    emptyPageBlock(pageId, { heading: title, content: legacyText(data) }),
    chromeFromCanonHome(canon, "Footer", pageId),
  ];
  return {
    data: { content, root: { props: { title } }, zones: {} },
    legacy: true,
  };
}

// ---------------------------------------------------------------------------
// Меню магазина
// ---------------------------------------------------------------------------

type NavLink = { href?: string; submenu?: NavLink[]; [k: string]: unknown };

function headerOf(page: unknown): Json | undefined {
  return isObject(page) && Array.isArray(page.content)
    ? page.content.find((b: Json) => b?.type === "Header")
    : undefined;
}

/** Меню магазина — с главной (так его сводит `unifyHeaderWithHome`), иначе с первой страницы с шапкой. */
function merchantMenu(pagesData: Json): NavLink[] | null {
  const pages = [pagesData.home, ...Object.values(pagesData)];
  const links = pages
    .map((p) => headerOf(p)?.props?.navigationLinks)
    .find((l) => Array.isArray(l));
  return Array.isArray(links) && links.length > 0 ? (links as NavLink[]) : null;
}

function rewriteLinks(
  links: NavLink[],
  moves: Map<string, string>,
  counts: Map<string, number>,
): NavLink[] {
  return links.map((link) => {
    const to = typeof link.href === "string" ? moves.get(link.href) : undefined;
    if (to) counts.set(link.href!, (counts.get(link.href!) ?? 0) + 1);
    const next: NavLink = to ? { ...link, href: to } : link;
    return Array.isArray(link.submenu)
      ? { ...next, submenu: rewriteLinks(link.submenu, moves, counts) }
      : next;
  });
}

function withMenu(pagesData: Json, menu: NavLink[]): Json {
  const wanted = JSON.stringify(menu);
  const withHeaderMenu = (page: unknown): unknown => {
    const header = headerOf(page);
    if (!header || JSON.stringify(header.props?.navigationLinks) === wanted)
      return page;
    const content = (page as Json).content.map((b: Json) =>
      b === header ? { ...b, props: { ...b.props, navigationLinks: menu } } : b,
    );
    return { ...(page as Json), content };
  };
  return Object.fromEntries(
    Object.entries(pagesData).map(([id, page]) => [id, withHeaderMenu(page)]),
  );
}

// ---------------------------------------------------------------------------
// Что пересеяно, убрано, потеряно
// ---------------------------------------------------------------------------

interface ThemePageFate {
  lost: ThemeSwitchReport["lost"];
  dropped: ThemeSwitchReport["dropped"];
}

function fateOfThemePages(
  previous: Json | null,
  canon: Json,
  previousCanon: Json | null,
): ThemePageFate {
  const fate: ThemePageFate = { lost: [], dropped: [] };
  if (!previousCanon) return fate;
  const prevPages: Json[] = Array.isArray(previous?.pages)
    ? previous.pages
    : [];
  const prevData: Json = isObject(previous?.pagesData)
    ? previous.pagesData
    : {};
  const refData: Json = isObject(previousCanon?.pagesData)
    ? previousCanon.pagesData
    : {};
  const inNewTheme = new Set(
    (canon.pages ?? []).map((p: Json) => String(p.id)),
  );

  for (const page of prevPages.filter((p) => !isUserPage(p))) {
    const data = prevData[page.id];
    if (data === undefined) continue; // досеивается из темы — правок мерчанта в ней нет
    const body = pageBodyFingerprint(data);
    const reference = refData[page.id];
    const edited =
      reference === undefined
        ? body !== EMPTY_BODY
        : body !== pageBodyFingerprint(reference);
    const entry = {
      pageId: String(page.id),
      slug: String(page.slug ?? ""),
      name: String(page.name ?? page.id),
    };
    if (inNewTheme.has(String(page.id))) {
      if (edited)
        fate.lost.push({ ...entry, reason: "merchant_edits_on_theme_page" });
      continue;
    }
    if (edited) fate.lost.push({ ...entry, reason: "theme_page_dropped" });
    else fate.dropped.push({ pageId: entry.pageId, slug: entry.slug });
  }
  return fate;
}

// ---------------------------------------------------------------------------

export function planThemeSwitch(input: ThemeSwitchInput): ThemeSwitchPlan {
  const { previous, canon, previousCanon } = input;
  const canonPages: Json[] = Array.isArray(canon.pages) ? canon.pages : [];
  const prevPages: Json[] = Array.isArray(previous?.pages)
    ? previous.pages
    : [];
  const prevData: Json = isObject(previous?.pagesData)
    ? previous.pagesData
    : {};

  const placements = placeUserPages(prevPages.filter(isUserPage), canonPages);
  const report: ThemeSwitchReport = {
    carried: { pages: [], menu: null },
    renamed: [],
    normalized: [],
    menuLinksRewritten: [],
    reseeded: {
      pages: canonPages.map((p) => ({
        id: String(p.id),
        slug: String(p.slug),
      })),
    },
    ...fateOfThemePages(previous, canon, previousCanon),
    lostDetection: previousCanon ? "seed-compare" : "unavailable",
  };

  const carriedPages: Json[] = [];
  const carriedData: Json = {};
  const slugMoves = new Map<string, string>();
  for (const { page, toId, toSlug, reason } of placements) {
    const meta = fullPageMeta(page, toId, toSlug);
    const full = fullPageData(prevData[page.id], toId, meta.name, canon);
    carriedPages.push(meta);
    carriedData[toId] = full.data;
    report.carried.pages.push({ id: toId, slug: toSlug, name: meta.name });
    if (full.legacy) report.normalized.push({ pageId: toId, from: "legacy" });
    if (!reason) continue;
    report.renamed.push({
      pageId: toId,
      fromId: String(page.id),
      toId,
      fromSlug: String(page.slug),
      toSlug,
      reason,
    });
    if (toSlug !== page.slug) slugMoves.set(String(page.slug), toSlug);
  }

  let pagesData: Json = { ...(canon.pagesData ?? {}), ...carriedData };
  const menu = merchantMenu(prevData);
  if (menu) {
    const counts = new Map<string, number>();
    const carriedMenu = rewriteLinks(menu, slugMoves, counts);
    pagesData = withMenu(pagesData, carriedMenu);
    report.carried.menu = { links: carriedMenu.length };
    report.menuLinksRewritten = [...counts].map(([from, count]) => ({
      from,
      to: slugMoves.get(from)!,
      count,
    }));
  }

  const document = {
    ...canon,
    pages: [...canonPages, ...carriedPages],
    pagesData,
  };
  return { document, report };
}
