import { migrateRevisionData } from '../revision-migrations';

const HOME = {
  content: [
    { type: 'Header', props: { id: 'Header-1' } },
    { type: 'Footer', props: { id: 'Footer-1' } },
  ],
  root: {},
};

// Дословная сигнатура домашнего шаблона (initialData конструктора), запечённая
// в контент-страницу через старый `|| initialData` fallback.
const HOME_JUNK = [
  { type: 'PromoBanner', props: { id: 'PromoBanner-1' } },
  { type: 'Header', props: { id: 'Header-1' } },
  { type: 'Hero', props: { id: 'Hero-1' } },
  { type: 'Collections', props: { id: 'Collections-1' } },
  { type: 'PopularProducts', props: { id: 'PopularProducts-1' } },
  { type: 'ImageWithText', props: { id: 'ImageWithText-1' } },
  { type: 'Newsletter', props: { id: 'Newsletter-1' } },
  { type: 'Footer', props: { id: 'Footer-1' } },
];

describe('migrateContentPages (server)', () => {
  it('заменяет home-junk page-about на [Header, Page, Footer] со стабильным id и heading «О нас»', () => {
    const r = migrateRevisionData({
      pagesData: { home: HOME, 'page-about': { content: HOME_JUNK, root: {} } },
    }) as { pagesData: Record<string, any> };
    const types = r.pagesData['page-about'].content.map((b: any) => b.type);
    expect(types).toEqual(['Header', 'Page', 'Footer']);
    const page = r.pagesData['page-about'].content.find((b: any) => b.type === 'Page');
    expect(page.props.id).toBe('Page-about');
    expect(page.props.heading).toBe('О нас');
  });

  it('копирует Header/Footer из home', () => {
    const r = migrateRevisionData({
      pagesData: { home: HOME, 'page-delivery': { content: HOME_JUNK, root: {} } },
    }) as { pagesData: Record<string, any> };
    expect(r.pagesData['page-delivery'].content[0].props.id).toBe('Header-1');
    expect(r.pagesData['page-delivery'].content[2].props.id).toBe('Footer-1');
    const page = r.pagesData['page-delivery'].content.find((b: any) => b.type === 'Page');
    expect(page.props.heading).toBe('Доставка');
  });

  it('НЕ трогает мерчант page-about (есть блок Page)', () => {
    const merchant = {
      content: [
        { type: 'Header', props: { id: 'h' } },
        { type: 'Page', props: { id: 'p', content: 'мой текст' } },
        { type: 'Footer', props: { id: 'f' } },
      ],
      root: {},
    };
    const r = migrateRevisionData({
      pagesData: { home: HOME, 'page-about': merchant },
    }) as { pagesData: Record<string, any> };
    expect(r.pagesData['page-about']).toBe(merchant);
  });

  it('НЕ сидит отсутствующую page-about (replace-junk-only)', () => {
    const r = migrateRevisionData({ pagesData: { home: HOME } }) as {
      pagesData: Record<string, any>;
    };
    expect(r.pagesData['page-about']).toBeUndefined();
  });

  it('идемпотентна (2-й прогон не меняет page-about)', () => {
    const once = migrateRevisionData({
      pagesData: { home: HOME, 'page-about': { content: HOME_JUNK, root: {} } },
    }) as { pagesData: Record<string, any> };
    const twice = migrateRevisionData(once) as { pagesData: Record<string, any> };
    expect(twice.pagesData['page-about']).toBe(once.pagesData['page-about']);
  });
});
