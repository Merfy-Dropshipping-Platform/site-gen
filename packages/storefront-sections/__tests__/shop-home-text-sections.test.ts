import { fileURLToPath } from 'node:url';
import { sha256 } from '@merfy/storefront-build';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTemplate, templateOptionsOf } from '../src/compile';
import { readManifest, type SectionManifest } from '../src/format';
import { readSectionFolder } from '../src/read-folder';
import { startSectionRenderer, type SectionRenderer } from '../src/render';
import { prepareInWorker } from '../src/sandbox';

// «Промо-баннер», «Основной текст» и «Изображение с текстом» — сводные секции пяти тем (базовые секции, 29.10): панель
// прода в её порядке, новые параметры — после, в группе «Вид»; раскладки и стили — признаками data-* на корне.
const SHOP = fileURLToPath(new URL('../fixtures/shop', import.meta.url));
const NAMES = ['promo-banner', 'main-text', 'image-with-text'] as const;
type Name = (typeof NAMES)[number];

interface Loaded {
  manifest: SectionManifest;
  module: string;
  hash: string;
}
const loaded = new Map<Name, Loaded>();
let renderer: SectionRenderer;

beforeAll(async () => {
  for (const name of NAMES) {
    const files = await readSectionFolder(`${SHOP}/${name}`);
    const manifest = readManifest(files);
    if (!manifest.ok) throw new Error(JSON.stringify(manifest.problems));
    const checked = await checkTemplate(files['template.astro'] ?? '', templateOptionsOf(manifest.value));
    if (checked.render === null) throw new Error(JSON.stringify(checked.problems));
    loaded.set(name, { manifest: manifest.value, module: checked.render, hash: sha256(Buffer.from(checked.render, 'utf8')) });
  }
  renderer = startSectionRenderer();
});

afterAll(async () => {
  await renderer.close();
});

const block = (id: string, type: string, settings: Record<string, string | boolean> = {}) => ({ id, type, settings });
const DEFAULT_BLOCKS: Record<Name, ReturnType<typeof block>[]> = {
  'promo-banner': [block('a1', 'announcement', { text: 'Доставка бесплатно', 'text-size': 'large', link: '/catalog', label: 'Смотреть' })],
  'main-text': [
    block('h1', 'heading', { heading: 'Заголовок', 'heading-size': 'medium' }),
    block('t1', 'text', { text: 'Текст', 'text-size': 'medium' }),
    block('b1', 'button', { 'button-label': 'Кнопка', 'button-link': '/catalog' }),
  ],
  'image-with-text': [
    block('h1', 'heading', { heading: 'Заголовок', 'heading-size': 'medium' }),
    block('t1', 'text', { text: 'Текст', 'text-size': 'medium' }),
    block('b1', 'button', { 'button-label': 'Кнопка', 'button-link': '/catalog' }),
  ],
};
const DEFAULT_SETTINGS: Record<Name, Record<string, string | boolean>> = {
  'promo-banner': { capitals: true },
  'main-text': { 'content-position': 'center', 'text-style': 'normal', 'button-style': 'primary' },
  'image-with-text': {
    image: 'https://s3.merfy.ru/p/1.jpg',
    height: 'medium',
    'image-position': 'left',
    align: 'left',
    layout: 'square',
    'content-position': 'center',
    'color-scheme': '',
    'cta-position': 'inline',
    'text-style': 'normal',
  },
};

const html = (
  name: Name,
  settings: Record<string, string | boolean> = {},
  blocks: ReturnType<typeof block>[] = DEFAULT_BLOCKS[name],
): Promise<string> => {
  const section = loaded.get(name);
  if (section === undefined) throw new Error(name);
  return renderer.render({
    section: `shop:${name}`,
    hash: section.hash,
    module: section.module,
    settings: { ...DEFAULT_SETTINGS[name], ...settings },
    blocks,
    theme: {},
  });
};
const attr = (source: string, name: string): string | null => new RegExp(`\\sdata-${name}="([^"]*)"`).exec(source)?.[1] ?? null;
const order = (name: Name): string[] =>
  (loaded.get(name)?.manifest.settings ?? []).map((entry) => ('wrapper' in entry ? `wrapper:${entry.wrapper}` : entry.id));
const groupOf = (name: Name, id: string): string | undefined => {
  const entry = (loaded.get(name)?.manifest.settings ?? []).find((item) => 'id' in item && item.id === id);
  return entry !== undefined && 'section' in entry ? entry.section : undefined;
};

describe('приём: без проблем и предупреждений', () => {
  it.each(NAMES)('%s', async (name) => {
    const result = await prepareInWorker({ prefix: 'shop', files: await readSectionFolder(`${SHOP}/${name}`) });
    expect(result.ok ? result.section.warnings : result.problems).toEqual([]);
  }, 30_000);
});

describe('панель: поля прода в их порядке, новые — после, в группе «Вид»', () => {
  it('«Промо-баннер»: схема, отступы; «Объявление» — блок с текстом, размером и ссылкой', () => {
    expect(order('promo-banner')).toEqual(['wrapper:scheme', 'wrapper:padding', 'capitals']);
    expect(groupOf('promo-banner', 'capitals')).toBe('Вид');
    const announcement = loaded.get('promo-banner')?.manifest.blocks?.announcement;
    expect(announcement?.limit).toBe(1);
    expect(announcement?.settings.map((field) => field.label)).toEqual(['Текст', 'Размер текста', 'Ссылка', 'Название ссылки']);
    expect(announcement?.settings[0]?.setting).toMatchObject({ kind: 'text', ai: 'title' });
  });

  it('«Промо-баннер»: ставится в список шапки (над «Шапкой», как у flux) и на страницу', () => {
    expect(loaded.get('promo-banner')?.manifest.groups).toEqual(['header', 'page']);
  });

  it('«Основной текст»: позиция в группе «Содержание», схема, отступы; стили — в «Вид»', () => {
    expect(order('main-text')).toEqual(['content-position', 'wrapper:scheme', 'wrapper:padding', 'text-style', 'button-style']);
    expect(groupOf('main-text', 'content-position')).toBe('Содержание');
    expect(groupOf('main-text', 'text-style')).toBe('Вид');
    const blocks = loaded.get('main-text')?.manifest.blocks ?? {};
    expect(Object.keys(blocks)).toEqual(['heading', 'text', 'button']);
    expect(blocks.heading?.settings[0]?.setting).toMatchObject({ kind: 'string', ai: 'title' });
    expect(blocks.text?.settings[0]?.setting).toMatchObject({ kind: 'text', ai: 'description' });
  });

  it('«Изображение с текстом»: поля прода с «Шириной» (общая настройка width), потом «Вид» с раскладкой', () => {
    expect(order('image-with-text')).toEqual([
      'image',
      'height',
      'wrapper:width',
      'image-position',
      'align',
      'wrapper:scheme',
      'wrapper:padding',
      'layout',
      'content-position',
      'color-scheme',
      'cta-position',
      'text-style',
    ]);
    expect(groupOf('image-with-text', 'layout')).toBe('Вид');
  });
});

describe('«Промо-баннер»', () => {
  it('размер и заглавные — признаками; текст с <em> и <strong> выводится как есть', async () => {
    const source = await html('promo-banner', {}, [
      block('a1', 'announcement', { text: 'Скидки <em>до 30%</em> и <strong>подарок</strong>', 'text-size': 'small', link: '/sale', label: 'Подробнее' }),
    ]);
    expect(attr(source, 'text-size')).toBe('small');
    expect(attr(source, 'capitals')).toBe('true');
    expect(source).toContain('<em>до 30%</em>');
    expect(source).toContain('<strong>подарок</strong>');
    expect(source).toMatch(/<a [^>]*href="\/sale"[^>]*>Подробнее<\/a>/);
  });

  it('ссылка без названия или название без ссылки — ссылки нет; пустой текст — только ссылка', async () => {
    const noLabel = await html('promo-banner', {}, [block('a1', 'announcement', { text: 'Текст', 'text-size': 'large', link: '/sale', label: '' })]);
    expect(noLabel).not.toContain('<a ');
    const noLink = await html('promo-banner', {}, [block('a1', 'announcement', { text: 'Текст', 'text-size': 'large', link: '', label: 'Подробнее' })]);
    expect(noLink).not.toContain('<a ');
    const noText = await html('promo-banner', {}, [block('a1', 'announcement', { text: '', 'text-size': 'large', link: '/sale', label: 'Подробнее' })]);
    expect(noText).toContain('Подробнее');
    expect(noText).not.toContain('<span');
  });

  it('блок скрыт — полосы нет', async () => {
    expect(await html('promo-banner', {}, [])).not.toContain('data-text-size="');
  });
});

describe('«Основной текст»', () => {
  it.each(['left', 'center', 'right'])('позиция %s — признак на корне', async (position) => {
    expect(attr(await html('main-text', { 'content-position': position }), 'position')).toBe(position);
  });

  it.each([
    ['text-style', 'italic'],
    ['button-style', 'secondary'],
  ])('%s=%s — признак на корне', async (id, value) => {
    expect(attr(await html('main-text', { [id]: value }), id === 'text-style' ? 'text-style' : 'button-style')).toBe(value);
  });

  it('заголовок и текст с начертаниями, размер — признаком; кнопка без названия не выводится', async () => {
    const source = await html('main-text', {}, [
      block('h1', 'heading', { heading: 'О <em>бренде</em>', 'heading-size': 'large' }),
      block('t1', 'text', { text: 'Мы <strong>делаем</strong>', 'text-size': 'small' }),
      block('b1', 'button', { 'button-label': '', 'button-link': '/catalog' }),
    ]);
    expect(source).toContain('<em>бренде</em>');
    expect(source).toContain('<strong>делаем</strong>');
    expect(attr(source, 'heading-size')).toBe('large');
    expect(attr(source, 'text-size')).toBe('small');
    expect(source).not.toContain('<a ');
  });
});

describe('«Изображение с текстом»', () => {
  it.each(['square', 'narrow', 'overlay'])('раскладка %s — признак на корне', async (layout) => {
    expect(attr(await html('image-with-text', { layout }), 'layout')).toBe(layout);
  });

  it.each([
    ['height', 'large', 'height'],
    ['image-position', 'right', 'image-position'],
    ['align', 'center', 'align'],
    ['cta-position', 'bottom', 'cta'],
    ['text-style', 'italic', 'text-style'],
    ['content-position', 'bottom', 'position'],
  ])('%s=%s — признак %s на корне', async (id, value, name) => {
    expect(attr(await html('image-with-text', { [id]: value }), name)).toBe(value);
  });

  it('картинка есть — тег img с адресом; нет — место под фото остаётся без img', async () => {
    expect(await html('image-with-text')).toContain('src="https://s3.merfy.ru/p/1.jpg"');
    expect(await html('image-with-text', { image: '' })).not.toContain('<img');
  });

  it('цвет плашки — схема контейнера только в раскладке «Текст поверх фото»', async () => {
    expect(await html('image-with-text', { layout: 'overlay', 'color-scheme': 'scheme-4' })).toContain('color-scheme-4');
    expect(await html('image-with-text', { layout: 'square', 'color-scheme': 'scheme-4' })).not.toContain('color-scheme-4');
  });

  it('скрытые блоки не выводятся', async () => {
    const source = await html('image-with-text', {}, [block('b1', 'button', { 'button-label': 'Кнопка', 'button-link': '/catalog' })]);
    expect(source).not.toContain('<h2');
    expect(source).not.toContain('<p ');
    expect(source).toContain('Кнопка');
  });
});
