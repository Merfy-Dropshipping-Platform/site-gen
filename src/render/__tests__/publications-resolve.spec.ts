import { applySectionPolicy } from '../section-policy';
import { normalizeCatalog, EMPTY_CATALOG, type Catalog } from '../catalog';

/**
 * Пункт 7 тестировщика: «В секции Публикации моканые данные. Брать данные из
 * админки и только, оживить при выборе публикации в секции».
 *
 * Публикации обязаны доезжать до рендера тем же путём, что товары и коллекции:
 * catalog → applySectionPolicy → __merfy.resolved. До правки в `Catalog` было
 * поле `publications`, но его никто не заполнял (create-render-context всегда
 * слал []), а сами блоки выдумывали статьи. Здесь фиксируем контракт резолва.
 */

const RAW = [
  {
    id: 'p1',
    title: 'Как мы открыли склад',
    slug: 'sklad',
    category: 'news',
    excerpt: 'Короткий анонс',
    coverImageUrl: 'https://cdn/1.jpg',
    publishedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'p2',
    title: 'Гид по размерам',
    slug: 'gid',
    category: 'articles',
    excerpt: '',
    coverImageUrl: null,
    publishedAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 'p3',
    title: 'Дневник основателя',
    slug: 'dnevnik',
    category: 'blog',
    excerpt: 'Про путь',
    coverImageUrl: null,
    publishedAt: null,
  },
];

const catalog: Catalog = normalizeCatalog({ publications: RAW });

function resolve(props: Record<string, unknown>, c: Catalog = catalog) {
  return applySectionPolicy('Publications', props, c, {}).publications;
}

describe('resolve публикаций для секции «Публикации»', () => {
  it('нормализатор каталога сохраняет категорию публикации', () => {
    expect(catalog.publications.map((p) => p.category)).toEqual([
      'news',
      'articles',
      'blog',
    ]);
  });

  it('без выбора отдаёт все публикации магазина по порядку', () => {
    expect(resolve({ cardsCount: 4 })?.map((p) => p.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });

  it('режет список по числу карточек', () => {
    expect(resolve({ cardsCount: 2 })?.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('выбор конкретной публикации по id показывает ИМЕННО её', () => {
    expect(resolve({ publicationType: 'p2', cardsCount: 3 })?.map((p) => p.id)).toEqual(['p2']);
  });

  it('выбор конкретной публикации по slug показывает ИМЕННО её', () => {
    expect(resolve({ publicationType: 'dnevnik' })?.map((p) => p.id)).toEqual(['p3']);
  });

  it('легаси-значение категории продолжает фильтровать по категории', () => {
    expect(resolve({ publicationType: 'news' })?.map((p) => p.id)).toEqual(['p1']);
    expect(resolve({ publicationType: 'Новости' })?.map((p) => p.id)).toEqual(['p1']);
  });

  it('легаси-конверт pagePicker {href,text} не роняет рендер', () => {
    expect(
      resolve({ publicationType: { href: '/about', text: 'О нас' } })?.map((p) => p.id),
    ).toEqual(['p1', 'p2', 'p3']);
  });

  it('выбранная публикация удалена — пусто, а не «первая попавшаяся»', () => {
    expect(resolve({ publicationType: 'p-deleted' })).toEqual([]);
  });

  it('у магазина нет публикаций — пустой список, а не выдумка', () => {
    expect(resolve({ cardsCount: 3 }, EMPTY_CATALOG)).toEqual([]);
  });

  it('другим блокам публикации не резолвятся', () => {
    expect(applySectionPolicy('Collections', {}, catalog, {}).publications).toBeNull();
  });
});
