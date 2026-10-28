import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';

// «Подвал» на витрине — сводный подвал пяти тем (базовые секции, 28.10): раскладка, рассылка, значки оплаты и заглавные
// — параметрами; ссылки — из данных магазина, как у подвала пяти тем на проде (src/utils/footer-data.ts): пункты меню,
// политики с текстом, контакты, соцсети «Настроек темы», значки оплаты при оплате онлайн.
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
const DEFAULTS = {
  logo: '',
  menu: 'main',
  newsletter: true,
  heading: 'Подпишитесь на нашу рассылку',
  'heading-size': 'small',
  text: 'Введите электронную почту и получайте информацию нашего бренда',
  'text-size': 'small',
  layout: '3-col',
  'payment-icons': true,
  capitals: 'columns',
};
// Меню подвала — настройка menu (по умолчанию «Главное меню»): пункты без подпунктов — колонка «Навигация», пункт с
// подпунктами — своя колонка.
const MENU = {
  title: 'Главное меню',
  items: [
    { label: 'Каталог', url: '/catalog', items: [] },
    { label: 'О нас', url: '/o-nas', items: [] },
    {
      label: 'Покупателям',
      url: '/buyers',
      items: [
        { label: 'Доставка', url: '/delivery', items: [] },
        { label: 'Оплата', url: '/payment', items: [] },
      ],
    },
  ],
};
const NO_MENU = { title: '', items: [] };
const LAYOUTS = ['3-col', '2-part', '2-part-asymmetric', 'minimal'];

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
  shop?: (typeof EMPTY_SHOP | typeof FULL_SHOP) & { signature?: string };
  theme?: Record<string, string>;
  menu?: typeof MENU | typeof NO_MENU;
}

const html = (variant: Variant = {}): Promise<string> =>
  renderer.render({
    section: 'shop:footer',
    hash,
    module,
    settings: { ...DEFAULTS, ...variant.settings },
    menus: { menu: variant.menu ?? MENU },
    blocks: [],
    theme: variant.theme ?? {},
    shop: variant.shop ?? EMPTY_SHOP,
  });

const tags = (source: string, name: string): string[] => source.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const root = (source: string): string => tags(source, 'div').find((tag) => tag.includes('data-layout=')) ?? '';

describe('«Подвал»: панель', () => {
  // Панель — как у подвала пяти тем на проде (conformance/panel-canon.json): поля прода в их порядке и с их подписями,
  // показ рассылки — «Скрыть/показать» в группе «Рассылка»; новые параметры — после, в группе «Вид».
  it('поля прода в их порядке и с их подписями, новые — в группе «Вид»', () => {
    const { settings } = JSON.parse(readFileSync(`${FOLDER}/section.json`, 'utf8')) as {
      settings: { id?: string; wrapper?: string; label?: string; section?: string }[];
    };
    const fields = settings.map((field) => [field.id ?? field.wrapper, field.label, field.section]);
    expect(fields.slice(0, 8).map(([, label]) => label)).toEqual([
      'Логотип',
      'Скрыть/показать',
      'Заголовок',
      'Размер заголовка',
      'Текст',
      'Размер текста',
      undefined,
      undefined,
    ]);
    expect(fields[1]?.[2]).toBe('Рассылка');
    expect(fields.slice(6, 8).map(([id]) => id)).toEqual(['scheme', 'padding']);
    expect(fields[8]?.[2]).toBe('Вид');
  });
});

describe('«Подвал»: признаки и раскладки', () => {
  it.each(LAYOUTS)('раскладка %s — признак на корне', async (layout) => {
    expect(attr(root(await html({ settings: { layout } })), 'data-layout')).toBe(layout);
  });

  it.each(['none', 'columns', 'all'])('заглавные %s — признак на корне', async (capitals) => {
    expect(attr(root(await html({ settings: { capitals } })), 'data-capitals')).toBe(capitals);
  });

  it('раскладки — вариантами классов, без своего CSS', () => {
    const template = readFileSync(`${FOLDER}/template.astro`, 'utf8');
    for (const variant of [
      'md:in-data-[layout=2-part]:flex-row',
      'in-data-[layout=2-part-asymmetric]:items-center',
      // «Одна строка»: заголовки колонок скрыты, имя колонки остаётся в aria-label у nav.
      'in-data-[layout=minimal]:hidden',
      'in-data-[layout=3-col]:hidden',
      'in-data-[capitals=columns]:uppercase',
    ]) {
      expect(template).toContain(variant);
    }
    expect(template).not.toMatch(/\sstyle=|<style/);
  });

  it('«Колонки»: название магазина не выводится, свой логотип — выводится; в других раскладках — название', async () => {
    expect(await html()).toMatch(/<a\b[^>]*in-data-\[layout=3-col\]:hidden[^>]*>Мой сайт<\/a>/);
    const withLogo = await html({ settings: { logo: 'https://cdn.merfy.ru/footer-logo.webp' } });
    expect(withLogo).toMatch(/<img\b[^>]*src="https:\/\/cdn\.merfy\.ru\/footer-logo\.webp"/);
    expect(withLogo).not.toContain('>Мой сайт</a>');
  });

  // Логотип магазина из настроек темы (тот же, что в шапке): в «Колонках» (flux, rose) его нет, в остальных раскладках
  // он вместо названия; своя картинка подвала важнее.
  it('логотип из настроек темы: вместо названия, кроме «Колонок»; своя картинка подвала важнее', async () => {
    const theme = { 'logo-image': 'https://cdn.merfy.ru/header-logo.webp' };
    const columns = await html({ theme });
    expect(tags(columns, 'a').find((tag) => tag.includes('href="/"') && tag.includes('in-data-[layout=3-col]:hidden'))).toBeDefined();
    const twoPart = await html({ theme, settings: { layout: '2-part' } });
    expect(twoPart).toMatch(/<img\b[^>]*src="https:\/\/cdn\.merfy\.ru\/header-logo\.webp"/);
    expect(twoPart).not.toContain('>Мой сайт</a>');
    const own = await html({ theme, settings: { layout: '2-part', logo: 'https://cdn.merfy.ru/footer-logo.webp' } });
    expect(own).toContain('footer-logo.webp');
    expect(own).not.toContain('header-logo.webp');
  });
});

describe('«Подвал»: рассылка', () => {
  it('включена: заголовок и текст с начертаниями, поле почты с подписью, кнопка, тексты ответов скрыты', async () => {
    const source = await html({ settings: { heading: 'Подпишитесь <em>сейчас</em>', text: 'Скидки <strong>раз в неделю</strong>' } });
    expect(source).toMatch(/<h2\b[^>]*>Подпишитесь <em>сейчас<\/em><\/h2>/);
    expect(source).toMatch(/<p\b[^>]*>Скидки <strong>раз в неделю<\/strong><\/p>/);
    expect(tags(source, 'form')[0]).toContain('data-action="subscribe"');
    expect(source).toMatch(/<label\b[^>]*for="footer-newsletter-email"/);
    expect(source).toMatch(/<input\b[^>]*type="email"/);
    for (const notice of ['subscribed', 'already-subscribed', 'too-many', 'invalid', 'failed']) {
      expect(tags(source, 'p').find((tag) => attr(tag, 'data-ref') === notice)).toMatch(/\shidden/);
    }
  });

  it('выключена: ни формы, ни поля почты', async () => {
    const source = await html({ settings: { newsletter: false } });
    expect(source).not.toContain('<form');
    expect(source).not.toContain('type="email"');
  });

  it('пустые заголовок и текст — их нет, форма есть', async () => {
    const source = await html({ settings: { heading: '', text: '' } });
    expect(tags(source, 'h2')).toEqual([]);
    expect(source).toContain('<form');
  });
});

describe('«Подвал»: ссылки из данных магазина', () => {
  it('без данных магазина: «Навигация» — пункты меню без подпунктов, пункт с подпунктами — своя колонка', async () => {
    const source = await html();
    expect(source).toContain('Навигация');
    for (const href of ['/catalog', '/o-nas', '/delivery', '/payment']) expect(source).toContain(`href="${href}"`);
    expect(source).toMatch(/<h3\b[^>]*>Покупателям<\/h3>/);
    expect(source).not.toContain('href="/buyers"');
    for (const title of ['Информация', 'Контакты']) expect(source).not.toContain(title);
  });

  it('меню пустое — колонок меню нет', async () => {
    const source = await html({ menu: NO_MENU });
    expect(source).not.toContain('Навигация');
    expect(source).not.toContain('Покупателям');
  });

  it('политики с текстом — колонка «Информация» со ссылками /legal/*; без политик колонки нет', async () => {
    const source = await html({ shop: FULL_SHOP });
    expect(source).toContain('Информация');
    expect(source).toContain('href="/legal/privacy"');
    expect(source).toContain('Политика возврата');
  });

  it('контакты: tel:, mailto:, остальные поля', async () => {
    const source = await html({ shop: FULL_SHOP });
    expect(source).toContain('Контакты');
    expect(source).toContain('href="tel:+7 999 000-00-00"');
    expect(source).toContain('href="mailto:shop@example.ru"');
    expect(source).toContain('Адрес: Москва');
  });

  it('соцсети — только заполненные, в новой вкладке; без соцсетей списка нет', async () => {
    const source = await html({ theme: { 'social-telegram': 'https://t.me/shop', 'social-vk': '' } });
    const telegram = tags(source, 'a').find((tag) => tag.includes('https://t.me/shop'));
    expect(telegram).toContain('target="_blank"');
    expect(telegram).toContain('rel="noopener noreferrer"');
    expect(source).not.toContain('ВКонтакте');
    expect(await html()).not.toContain('Telegram');
  });

  it('значки оплаты — при оплате онлайн и включённом параметре', async () => {
    expect(await html({ shop: FULL_SHOP })).toContain('aria-label="Способы оплаты"');
    expect(await html({ shop: FULL_SHOP, settings: { 'payment-icons': false } })).not.toContain('Способы оплаты');
    expect(await html()).not.toContain('Способы оплаты');
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

  // Своя подпись из карточки темы (site.settings.themeBrandName) — текстом, без ссылки; стандартная — ссылкой (как на проде).
  it('своя подпись мерчанта — вместо «Разработано на Merfy», текстом без ссылки на платформу', async () => {
    const source = await html({ shop: { ...EMPTY_SHOP, signature: 'Сделано в ООО «Ромашка»' } });
    expect(source).toContain('Сделано в ООО «Ромашка»');
    expect(source).not.toContain('Разработано на Merfy');
    expect(source).not.toContain('href="https://merfy.ru/"');
  });

  it('подпись с разметкой выводится текстом: теги экранированы', async () => {
    const source = await html({ shop: { ...EMPTY_SHOP, signature: '<b>Свой</b> текст' } });
    expect(source).toContain('&lt;b&gt;Свой&lt;/b&gt; текст');
    expect(source).not.toContain('<b>Свой</b>');
  });

  it('подписи нет — стандартная ссылкой', async () => {
    for (const shop of [EMPTY_SHOP, { ...EMPTY_SHOP, signature: '' }]) {
      const source = await html({ shop });
      expect(tags(source, 'a').some((tag) => tag.includes('href="https://merfy.ru/"'))).toBe(true);
    }
  });

  it.each(LAYOUTS)('%s: нет style, скриптов и поведений', async (layout) => {
    const source = await html({ settings: { layout }, shop: FULL_SHOP, theme: { 'social-telegram': 'https://t.me/shop' } });
    expect(source).not.toMatch(/\sstyle=/);
    expect(source).not.toContain('<script');
    expect(source).not.toContain('data-behavior');
  });
});
