import { readFileSync } from "fs";
import * as path from "path";
import { readNewThemeIds } from "../storefront-handoff/storefront-handoff.service";

// Особые страницы магазина новой темы (блок 7 «Секций и SDK», часть 7а): список — файл сборки витрин
// packages/storefront-build/special-pages.json (читается при загрузке модуля из process.cwd(), как theme-versions.json);
// новые темы — readNewThemeIds(process.cwd()) из storefront-handoff.service.
export const SPECIAL_PAGES_FILE =
  "packages/storefront-build/special-pages.json";

export type SpecialPage = { id: string; name: string; slug: string };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readString(record: UnknownRecord, field: string, at: number): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(
      `${SPECIAL_PAGES_FILE}: строка ${at}, поле ${field} — не непустая строка`,
    );
  return value;
}

function toSpecialPage(row: unknown, at: number): SpecialPage {
  if (!isRecord(row))
    throw new Error(`${SPECIAL_PAGES_FILE}: строка ${at} — не объект`);
  return {
    id: readString(row, "id", at),
    name: readString(row, "name", at),
    slug: readString(row, "slug", at),
  };
}

function readSpecialPages(root: string): readonly SpecialPage[] {
  const file = path.join(root, SPECIAL_PAGES_FILE);
  const list: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(list))
    throw new Error(`${SPECIAL_PAGES_FILE}: список особых страниц — не массив`);
  return list.map(toSpecialPage);
}

export const SPECIAL_PAGES: readonly SpecialPage[] = readSpecialPages(
  process.cwd(),
);
export const SPECIAL_PAGE_IDS: ReadonlySet<string> = new Set(
  SPECIAL_PAGES.map((page) => page.id),
);
export const SPECIAL_PAGE_SLUGS: ReadonlySet<string> = new Set(
  SPECIAL_PAGES.map((page) => page.slug),
);

const NEW_THEME_IDS = readNewThemeIds(process.cwd());

export function isNewThemeId(themeId: string | null | undefined): boolean {
  return typeof themeId === "string" && NEW_THEME_IDS.has(themeId);
}

const emptyTree = (title: string): UnknownRecord => ({
  content: [],
  root: { props: { title } },
  zones: {},
});

const specialPageRecord = (page: SpecialPage): UnknownRecord => ({
  id: page.id,
  name: page.name,
  slug: page.slug,
  role: "system",
  isCustom: false,
  seo: null,
});

// { pages: записи особых страниц, pagesData: пустые деревья, currentPageId: "home", sections: {} }
export function newThemeStarterRevision(): Record<string, unknown> {
  const pagesData: UnknownRecord = {};
  for (const page of SPECIAL_PAGES) pagesData[page.id] = emptyTree(page.name);
  return {
    pages: SPECIAL_PAGES.map(specialPageRecord),
    pagesData,
    currentPageId: "home",
    sections: {},
  };
}

const hasPage = (pages: unknown[], id: string): boolean =>
  pages.some((page) => isRecord(page) && page.id === id);

// Новый объект: недостающие записи особых страниц — в конец pages ({ id, name, slug, role: "system", isCustom: false,
// seo: null }), недостающие деревья — в pagesData ({ content: [], root: { props: { title: name } }, zones: {} }),
// currentPageId не строка — "home". Остальные ключи (sections, menus, …) — те же объекты; записанные страницы не меняются.
export function withSpecialPages(
  doc: Record<string, unknown>,
): Record<string, unknown> & { pages: unknown[] } {
  const pages: unknown[] = Array.isArray(doc.pages) ? [...doc.pages] : [];
  const pagesData: UnknownRecord = isRecord(doc.pagesData)
    ? { ...doc.pagesData }
    : {};
  for (const page of SPECIAL_PAGES) {
    if (!hasPage(pages, page.id)) pages.push(specialPageRecord(page));
    if (!isRecord(pagesData[page.id]))
      pagesData[page.id] = emptyTree(page.name);
  }
  const result: Record<string, unknown> & { pages: unknown[] } = {
    ...doc,
    pages,
    pagesData,
  };
  if (typeof result.currentPageId !== "string") result.currentPageId = "home";
  return result;
}
