import { migrateRevisionData, storeChromeOnCheckoutResult } from '../revision-migrations';

/**
 * «Спасибо за заказ» — обычная шапка и подвал магазина (владелец 26.09).
 * В ревизии страницы лежала «Шапка оформления» без подвала: конструктор
 * показывал её, а витрина — шапку магазина.
 */
type Block = { type: string; props: Record<string, unknown> };
type PagesData = Record<string, { content: Block[] }>;

const home: Block[] = [
  { type: 'PromoBanner', props: { id: 'PromoBanner-home', text: 'Скидка 10%' } },
  { type: 'Header', props: { id: 'Header-home', siteTitle: 'Мой сайт', logoPosition: 'top-center' } },
  { type: 'Hero', props: { id: 'Hero-home' } },
  { type: 'Footer', props: { id: 'Footer-home', siteTitle: 'Мой сайт' } },
];
const thankYou: Block[] = [
  { type: 'CheckoutHeader', props: { id: 'CheckoutHeader-1', siteTitle: 'Мой магазин' } },
  { type: 'OrderConfirmation', props: { id: 'OrderConfirmation-1', colorScheme: 'scheme-3' } },
];
const pages = (content: Block[]): PagesData => ({
  home: { content: home },
  'page-checkout-result': { content },
});
const types = (p: Record<string, unknown>) =>
  ((p['page-checkout-result'] as { content: Block[] }).content).map((b) => b.type);

describe('storeChromeOnCheckoutResult', () => {
  it('«Шапку оформления» заменяет шапкой главной и добавляет подвал', () => {
    const out = storeChromeOnCheckoutResult(pages(thankYou));
    expect(types(out)).toEqual(['PromoBanner', 'Header', 'OrderConfirmation', 'Footer']);
  });

  it('копии получают свои id страницы, настройки — с главной, секция не тронута', () => {
    const out = storeChromeOnCheckoutResult(pages(thankYou));
    const content = (out['page-checkout-result'] as { content: Block[] }).content;
    expect(content[1].props).toEqual({ id: 'Header-page-checkout-result', siteTitle: 'Мой сайт', logoPosition: 'top-center' });
    expect(content[3].props.id).toBe('Footer-page-checkout-result');
    expect(content[2]).toEqual(thankYou[1]);
  });

  it('повторный прогон ничего не меняет', () => {
    const once = storeChromeOnCheckoutResult(pages(thankYou));
    expect(storeChromeOnCheckoutResult(once)).toBe(once);
  });

  it('страница уже со своей шапкой и подвалом — не трогается', () => {
    const own = pages([home[1], thankYou[1], home[3]]);
    expect(storeChromeOnCheckoutResult(own)).toBe(own);
  });

  it('у главной нет шапки — страницу не трогаем', () => {
    const noHeader: PagesData = { home: { content: [home[2]] }, 'page-checkout-result': { content: thankYou } };
    expect(storeChromeOnCheckoutResult(noHeader)).toBe(noHeader);
  });
});

describe('migrateRevisionData: «Спасибо» у существующего bloom-сайта', () => {
  it('сохранённая страница получает шапку и подвал магазина', () => {
    const out = migrateRevisionData({ pagesData: pages(thankYou) }, 'bloom') as { pagesData: PagesData };
    expect(types(out.pagesData)).toEqual(['PromoBanner', 'Header', 'OrderConfirmation', 'Footer']);
  });

  it('досев страницы старому сайту — без платформенной схемы', () => {
    const out = migrateRevisionData({ pagesData: { home: { content: home } } }, 'bloom') as { pagesData: PagesData };
    const page = out.pagesData['page-checkout-result'];
    expect(page.content.map((b) => b.type)).toEqual(['PromoBanner', 'Header', 'OrderConfirmation', 'Footer']);
    expect(page.content[2].props.colorScheme).toBeUndefined();
  });
});
