import { z } from 'zod';
import specialPagesJson from '../special-pages.json';

// Особые страницы платформы (блок 7 «Секций и SDK», часть 7а): постоянный id, имя в меню страниц конструктора, адрес.
// Тот же файл читает sites (src/content/new-theme-pages.ts). Шаблоны записей — блок 8; блоки 10 и 11 добавят свои строки.
export interface SpecialPage {
  id: string;
  name: string;
  slug: string;
}

// Страница, на которой стоит секция: Astro.props.page. У страницы 404 адреса нет — null.
export interface PageInfo {
  id: string;
  path: string | null;
}

// Id — kebab; адрес — «/» или «/kebab».
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
// slug строки: '/', адрес /o-nas или образец адреса шаблона записей — /product/:slug, /blogs/:blog/:slug.
const TEMPLATE_SLUG = /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/:[a-z]+)+$/;
const pageSchema = z.strictObject({
  id: z.string().regex(KEBAB, { error: 'id — kebab-case' }),
  name: z.string().min(1, { error: 'имя — непустая строка' }),
  slug: z
    .string()
    .regex(SLUG, { error: 'адрес — «/» или «/страница»' })
    .or(z.string().regex(TEMPLATE_SLUG, { error: 'адрес — «/» или «/страница»' })),
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
  return checked.data;
}

export const SPECIAL_PAGES: readonly SpecialPage[] = parseSpecialPages(specialPagesJson);
export const NOT_FOUND_PAGE_ID = 'not-found';
export const SPECIAL_PAGE_IDS: ReadonlySet<string> = new Set(SPECIAL_PAGES.map((page) => page.id));
// Занятые адреса: у образца — его первая часть до «/:» (/product/:slug → /product), у остальных — адрес как есть.
const takenSlug = (slug: string): string => slug.split('/:')[0];
export const SPECIAL_PAGE_SLUGS: ReadonlySet<string> = new Set(SPECIAL_PAGES.map((page) => takenSlug(page.slug)));
export const HOME_PAGE: PageInfo = { id: 'home', path: '/' };
export const NOT_FOUND_TEXT = { heading: 'Страница не найдена', home: 'На главную' } as const;
export const UNAVAILABLE_TEXT = { heading: 'Сайт временно недоступен', text: 'Попробуйте через минуту' } as const;

// «Страница не найдена · Шарфы»
export const platformPageTitle = (heading: string, shop: string): string => `${heading} · ${shop}`;
