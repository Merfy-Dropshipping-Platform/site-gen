import { sha256 } from '../src/canonical';
import type { BuildInputs, CodeInstance, Entity } from '../src/inputs';
import type { BlogData, CollectionData, ProductData, PublicationData } from '../src/records';
import type { PageRender, SectionRenderRequest } from '../src/sections-render';
import { changedInputs } from './support';

// Записи и шаблоны для тестов страниц записей (блок 8 «Секций и SDK», часть 8б): сущности — в формах сборщика (часть
// 8а-2), шаблон — список секций с одной подставной секцией.
export const AT = '2026-10-20T10:00:00.000Z';
export const LATER = '2026-10-21T10:00:00.000Z';
export const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const [P1, P2, P3] = [ID(101), ID(102), ID(103)];
export const C1 = ID(201);
export const B1 = ID(301);
export const A1 = ID(401);
export const SITE_KEY = 'site:00000000-0000-4000-8000-000000000001';
const NO_SEO = { title: '', description: '' };

export function product(id: string, data: Partial<ProductData> = {}, updatedAt = AT): Entity {
  const value: ProductData = {
    title: 'Шарф',
    handle: 'sharf',
    description: 'Тёплый шарф из льна',
    price: 190000,
    compareAtPrice: null,
    images: ['https://s3.merfy.ru/p/1.jpg'],
    available: true,
    options: [],
    variants: [],
    collectionIds: [C1],
    seo: NO_SEO,
    ...data,
  };
  return { type: 'product', id, updatedAt, data: value };
}

export function collection(id: string, data: Partial<CollectionData> = {}, updatedAt = AT): Entity {
  const value: CollectionData = {
    title: 'Кашемир',
    handle: 'kashemir',
    description: 'Тёплые шарфы',
    images: [],
    productIds: [P1],
    seo: NO_SEO,
    ...data,
  };
  return { type: 'collection', id, updatedAt, data: value };
}

export function blog(id: string, data: Partial<BlogData> = {}): Entity {
  const value: BlogData = { title: 'Новости', handle: 'novosti', ...data };
  return { type: 'blog', id, updatedAt: AT, data: value };
}

export function article(id: string, data: Partial<PublicationData> = {}, updatedAt = AT): Entity {
  const value: PublicationData = {
    title: 'Как ухаживать за льном',
    slug: 'linen',
    blogId: B1,
    blogHandle: 'novosti',
    excerpt: 'Стирка и глажка',
    content: '<p>Стирать при 30°</p>',
    publishedAt: '2026-10-19T10:00:00.000Z',
    cover: null,
    seo: NO_SEO,
    ...data,
  };
  return { type: 'publication', id, updatedAt, data: value };
}

export const policy = (type: string, content: string, updatedAt = AT): Entity => ({
  type: 'policy',
  id: type,
  updatedAt,
  data: { content },
});

// Подставная секция шаблонов: сборка сверяет модуль рендера по хешу, разметку даёт функция рендера теста.
export const RECORD_SECTION = 'shop:record';
export const RECORD_MODULE = 'export default "запись";';
export const RECORD_HASH = sha256(Buffer.from(RECORD_MODULE, 'utf8'));

export const placed = (id: string, hidden = false): CodeInstance => ({
  id,
  section: RECORD_SECTION,
  settings: {},
  ...(hidden ? { hidden: true as const } : {}),
});

// Входы стенда с этими сущностями и списками секций по id страниц: home, header, product, policy, …
export function recordInputs(entities: Entity[], pages: Record<string, CodeInstance[]> = {}): BuildInputs {
  return changedInputs((inputs) => {
    inputs.data.entities = entities;
    inputs.code = {
      sections: [{ name: RECORD_SECTION, kind: 'section', hash: RECORD_HASH, render: RECORD_HASH, script: null }],
      pages,
      globals: [],
    };
  });
}

// Рендер подставной секции: запрос — в requests, разметка — есть ли у страницы запись.
export const recordRender =
  (requests: SectionRenderRequest[] = []) =>
  (request: SectionRenderRequest): Promise<string> => {
    requests.push(request);
    return Promise.resolve(`<p class="flex">${request.page?.record === undefined ? 'без записи' : 'запись'}</p>`);
  };

export const recordPage = (requests: SectionRenderRequest[] = []): PageRender => ({
  sections: { modules: new Map([[RECORD_HASH, RECORD_MODULE]]), render: recordRender(requests) },
  mode: 'live',
});
