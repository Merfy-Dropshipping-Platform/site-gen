import { z } from 'zod';
import specialPagesJson from '../special-pages.json';
import type { PageList } from './page-list';

// Особые страницы платформы (блок 7 «Секций и SDK», часть 7а): постоянный id, имя в меню страниц конструктора, адрес.
// Тот же файл читает sites (src/content/new-theme-pages.ts). Шаблоны записей — блок 8; блоки 10 и 11 добавят свои строки.
export interface SpecialPage {
  id: string;
  name: string;
  slug: string;
  // Блок 10, часть 10а (Р10а-15): та же страница ещё по этим адресам — статические, не заняты своими страницами.
  aliases?: readonly string[];
  // Блок 10, часть 10а (Р10а-15): страница не из секций — её пишет сборка (оформление заказа и его результат).
  sections?: false;
}

// Страница, на которой стоит секция: Astro.props.page. У страницы 404 адреса нет — null.
export interface PageInfo {
  id: string;
  path: string | null;
  // Блок 8, часть 8б: запись страницы шаблона — публичные поля (records.ts). Нет ключа — страница без записи; null так
  // видят секции процесса рендера.
  record?: object | null;
  // Блок 11, часть 11а: список страницы; нет — у страницы нет списка.
  list?: PageList;
}

// Id — kebab; адрес — «/», «/kebab» или из нескольких статических частей (блок 10: /account/profile).
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATIC_SLUG = /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
// slug строки: '/', статический адрес (одна или несколько частей) или образец шаблона записей — /product/:slug.
const TEMPLATE_SLUG = /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/:[a-z]+)+$/;
const isSlug = (slug: string): boolean => slug === '/' || STATIC_SLUG.test(slug) || TEMPLATE_SLUG.test(slug);
// Копия адреса (блок 10, Р10а-15) — статический адрес, не «/» и не образец.
const aliasSchema = z.string().regex(STATIC_SLUG, { error: 'копия адреса — статический адрес «/страница»' });
const pageSchema = z.strictObject({
  id: z.string().regex(KEBAB, { error: 'id — kebab-case' }),
  name: z.string().min(1, { error: 'имя — непустая строка' }),
  slug: z.string().refine(isSlug, { error: 'адрес — «/», «/страница» или образец «/страница/:имя»' }),
  aliases: z.array(aliasSchema).optional(),
  // Страница не из секций — только пометка false; true — ошибка схемы.
  sections: z.literal(false).optional(),
});

// Список один для сборки и sites: непустые id и адреса, без повторов; первая строка — главная с адресом «/».
export function parseSpecialPages(value: unknown): SpecialPage[] {
  const checked = z.array(pageSchema).safeParse(value);
  if (!checked.success) throw new Error(`особые страницы: ${checked.error.issues[0]?.message ?? 'не список страниц'}`);
  const [first] = checked.data;
  if (first === undefined || first.id !== 'home' || first.slug !== '/')
    throw new Error('особые страницы: первая страница — home с адресом /');
  const unique = (field: keyof SpecialPage): boolean =>
    new Set(checked.data.map((page) => page[field])).size === checked.data.length;
  if (!unique('id')) throw new Error('особые страницы: id повторяется');
  if (!unique('slug')) throw new Error('особые страницы: адрес повторяется');
  // Блок 10 (Р10а-15): копия не равна адресу своей страницы и не занимает чужой адрес или копию.
  const addresses = checked.data.flatMap((page) => [page.slug, ...(page.aliases ?? [])]);
  const duplicate = addresses.find((address, at) => addresses.indexOf(address) !== at);
  if (duplicate !== undefined) throw new Error('особые страницы: адрес или копия повторяется');
  return checked.data;
}

export const SPECIAL_PAGES: readonly SpecialPage[] = parseSpecialPages(specialPagesJson);
export const NOT_FOUND_PAGE_ID = 'not-found';
export const SPECIAL_PAGE_IDS: ReadonlySet<string> = new Set(SPECIAL_PAGES.map((page) => page.id));
// Особые страницы блока 10 (часть 10а, Р10а-14): id с префиксом page- — id пяти тем, по порядку списка. Из секций —
// строки сборки (Б10а-8), sections: false — страницы сборки (Б10а-9); каталог блока 11 сюда не входит.
export const STATIC_SPECIAL_PAGES: readonly SpecialPage[] = SPECIAL_PAGES.filter((page) => page.id.startsWith('page-'));
// Занятые адреса: первая часть адреса каждой страницы и каждой копии, без повторов, по порядку списка
// (/product/:slug → /product, /account/profile → /account).
const addressesOf = (page: SpecialPage): readonly string[] => [page.slug, ...(page.aliases ?? [])];
const firstSegment = (address: string): string => `/${address.slice(1).split('/')[0]}`;
export const SPECIAL_PAGE_SLUGS: ReadonlySet<string> = new Set(
  SPECIAL_PAGES.flatMap(addressesOf).map(firstSegment),
);
export const HOME_PAGE: PageInfo = { id: 'home', path: '/' };
export const NOT_FOUND_TEXT = { heading: 'Страница не найдена', home: 'На главную' } as const;
export const UNAVAILABLE_TEXT = { heading: 'Сайт временно недоступен', text: 'Попробуйте через минуту' } as const;

// «Страница не найдена · Шарфы»
export const platformPageTitle = (heading: string, shop: string): string => `${heading} · ${shop}`;
