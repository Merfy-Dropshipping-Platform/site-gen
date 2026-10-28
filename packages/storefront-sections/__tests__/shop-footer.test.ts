import { fileURLToPath } from 'node:url';
import { sha256 } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// «Подвал» на витрине (блок 7, часть 7б, раздел 8 design.md): договор разметки plan-7b.md, 7б-4.
const FOLDER = fileURLToPath(new URL('../fixtures/shop/footer', import.meta.url));
const EMPTY_SHOP = { name: 'Мой сайт', contacts: { phone: '', email: '', fields: [] }, policies: [], payments: { online: false } };
const FULL_SHOP = {
  name: 'Мой сайт',
  contacts: { phone: '+7 999 000-00-00', email: 'shop@example.ru', fields: [{ label: 'Адрес', value: 'Москва' }] },
  policies: [
    { type: 'privacy', title: 'Политика конфиденциальности', url: '/legal/privacy' },
    { type: 'refund', title: 'Политика возврата', url: '/legal/refund' },
  ],
  payments: { online: true },
};
const NEWSLETTER = { newsletter: true, heading: 'Подпишитесь на нашу рассылку', text: 'Скидки раз в неделю' };
// Меню подвала — настройка menu (по умолчанию «Главное меню»): у нового магазина в нём «Каталог» и «О нас».
const MENU = {
  title: 'Главное меню',
  items: [
    { label: 'Каталог', url: '/catalog', items: [] },
    { label: 'О нас', url: '/o-nas', items: [] },
  ],
};
const NO_MENU = { title: '', items: [] };

let renderer: SectionRenderer;
let module = '';
let hash = '';

beforeAll(async () => {
  const files = await readSectionFolder(FOLDER);
  const manifest = readManifest(files);
  if (!manifest.ok) throw new Error(JSON.stringify(manifest.problems));
  const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest.value));
  if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
  module = checked.render;
  hash = sha256(Buffer.from(module, 'utf8'));
  renderer = startSectionRenderer();
});

afterAll(async () => {
  await renderer.close();
});

interface Variant {
  settings?: Record<string, string | boolean>;
  shop?: typeof EMPTY_SHOP | typeof FULL_SHOP;
  theme?: Record<string, string>;
  menu?: typeof MENU;
}

const html = (variant: Variant = {}): Promise<string> =>
  renderer.render({
    section: 'shop:footer',
    hash,
    module,
    settings: { logo: '', menu: 'main', newsletter: false, heading: '', 'heading-size': 'small', text: '', 'text-size': 'small', ...variant.settings },
    menus: { menu: variant.menu ?? MENU },
    blocks: [],
    theme: variant.theme ?? {},
    shop: variant.shop ?? EMPTY_SHOP,
  });

const tags = (source: string, name: string): string[] => source.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
const hasFlag = (tag: string, name: string): boolean => new RegExp(`\\s${name}(?=[\\s=>/])`).test(tag);

describe('«Подвал»: рассылка', () => {
  it('включена: заголовок, текст, поле почты, кнопка неактивна, строка статуса', async () => {
    const source = await html({ settings: NEWSLETTER });
    expect(tags(source, 'h2')).toHaveLength(1);
    expect(source).toContain('Подпишитесь на нашу рассылку');
    expect(source).toContain('Скидки раз в неделю');
    expect(source).toMatch(/<input\b[^>]*type="email"/);
    const submit = tags(source, 'button').find((tag) => tag.includes('type="submit"'));
    expect(submit === undefined ? false : hasFlag(submit, 'disabled')).toBe(true);
    expect(source).toContain('role="status"');
  });

  it('выключена: ни формы, ни поля почты', async () => {
    const source = await html({ settings: { newsletter: false } });
    expect(source).not.toContain('<form');
    expect(source).not.toContain('type="email"');
  });
});

describe('«Подвал»: колонки', () => {
  it('без данных магазина: «Навигация» — пункты меню подвала, остальных колонок нет', async () => {
    const source = await html();
    expect(source).toContain('Навигация');
    for (const href of ['/catalog', '/o-nas']) expect(source).toContain(`href="${href}"`);
    expect(source).not.toContain('href="/about"');
    expect(source).not.toContain('href="/contacts"');
    expect(source).not.toContain('Информация');
    expect(source).not.toContain('Социальные сети');
  });

  it('меню пустое — колонки «Навигация» нет', async () => {
    expect(await html({ menu: NO_MENU })).not.toContain('Навигация');
  });

  it('политики с текстом: колонка «Информация» со ссылками /legal/*', async () => {
    const source = await html({ shop: FULL_SHOP });
    expect(source).toContain('Информация');
    expect(source).toContain('href="/legal/privacy"');
    expect(source).toContain('Политика возврата');
  });

  it('контакты, сети и оплата: «Социальные сети», tel:, mailto:, поля, ссылка сети в новой вкладке, плашки оплаты', async () => {
    const source = await html({ shop: FULL_SHOP, theme: { 'social-telegram': 'https://t.me/shop' } });
    expect(source).toContain('Социальные сети');
    expect(source).toContain('href="tel:+7 999 000-00-00"');
    expect(source).toContain('href="mailto:shop@example.ru"');
    expect(source).toContain('Адрес');
    const telegram = tags(source, 'a').find((tag) => tag.includes('https://t.me/shop'));
    expect(telegram).toContain('target="_blank"');
    expect(telegram).toContain('rel="noopener noreferrer"');
    for (const name of ['Mastercard', 'Visa', 'МИР']) expect(source).toContain(name);
  });

  it('только соцсеть без контактов — колонка есть; оплаты онлайн нет — плашек нет', async () => {
    const source = await html({ theme: { 'social-vk': 'https://vk.com/shop' } });
    expect(source).toContain('Социальные сети');
    expect(source).not.toContain('Mastercard');
  });

  it('свой логотип — картинка в колонке «Навигация»', async () => {
    const source = await html({ settings: { logo: 'https://cdn.merfy.ru/footer-logo.webp' } });
    expect(source).toMatch(/<img\b[^>]*src="https:\/\/cdn\.merfy\.ru\/footer-logo\.webp"/);
  });
});

describe('«Подвал»: нижняя строка и чистота разметки', () => {
  it('«Разработано на Merfy» — ссылка на merfy.ru в новой вкладке', async () => {
    const source = await html();
    const link = tags(source, 'a').find((tag) => tag.includes('href="https://merfy.ru/"'));
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(source).toContain('Разработано на Merfy');
  });

  it('нет style, скриптов и поведений', async () => {
    const source = await html({ settings: NEWSLETTER, shop: FULL_SHOP, theme: { 'social-telegram': 'https://t.me/shop' } });
    expect(source).not.toMatch(/\sstyle=/);
    expect(source).not.toContain('<script');
    expect(source).not.toContain('data-behavior');
  });
});
