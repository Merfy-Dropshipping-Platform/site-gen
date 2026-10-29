import { describe, expect, it } from 'vitest';
import { settingFieldsOf } from '../src/fields';
import { readManifest } from '../src/format';
import { nameIssue } from '../src/name-check';
import { NAMES } from '../src/names';
import { RECORD_SETTING_KINDS } from '../src/record-fields';
import { resolveSectionSettings } from '../src/settings';

// Поля с записями и подсказка (блок 8 «Секций и SDK», часть 8г; design.md 8.9): виды product, collection, blog, policy
// и hint. Значение — id или адрес записи (у политики — тип), пусто — "" или null; умолчание — null.
const PRODUCT = { id: 'product', label: 'Выбор товара', setting: { kind: 'product' } };
const COLLECTION = { id: 'collection', label: 'Выбор коллекции', setting: { kind: 'collection', default: null } };
const POSTS = { id: 'posts', label: 'Выбор публикации', setting: { kind: 'blog' } };
const POLICY = { id: 'policy', label: 'Выбор страницы', setting: { kind: 'policy' } };
const PRICE = {
  id: 'price',
  label: 'Стоимость',
  setting: {
    kind: 'hint',
    title: 'Настройка недоступна',
    text: 'Изменения проводятся на странице',
    link: { label: 'Товары', href: '/products' },
  },
};
const manifestOf = (settings: unknown[], extra: object = {}) => ({
  sdk: 1,
  name: 'product-card',
  kind: 'section',
  title: 'Карточка товара',
  settings,
  ...extra,
});
const read = (manifest: unknown) => readManifest({ 'section.json': JSON.stringify(manifest) });
const problemsOf = (manifest: unknown): string[] => {
  const result = read(manifest);
  return result.ok ? [] : result.problems.map((item) => `${item.code} ${item.message}`);
};
function fieldsOf(settings: unknown[]) {
  const result = read(manifestOf(settings));
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return settingFieldsOf(result.value.settings);
}

describe('виды полей с записями', () => {
  it('пять видов; умолчание — null, ключ default можно не писать', () => {
    expect(RECORD_SETTING_KINDS).toEqual(['product', 'collection', 'blog', 'policy', 'hint']);
    const fields = fieldsOf([PRODUCT, COLLECTION, POSTS, POLICY, PRICE]);
    expect(fields.map((field) => [field.id, field.setting.kind, field.setting.default])).toEqual([
      ['product', 'product', null],
      ['collection', 'collection', null],
      ['posts', 'blog', null],
      ['policy', 'policy', null],
      ['price', 'hint', null],
    ]);
  });

  it('форма строгая: умолчание не null, лишний ключ, подсказка без текста, ссылка не в кабинет', () => {
    const settings = [
      { ...PRODUCT, setting: { kind: 'product', default: 'sharf' } },
      { ...POSTS, setting: { kind: 'blog', limit: 3 } },
      { ...PRICE, setting: { ...PRICE.setting, text: '' } },
      { ...PRICE, setting: { ...PRICE.setting, link: { label: 'Товары', href: 'https://merfy.ru/products' } } },
    ];
    expect(problemsOf(manifestOf(settings))).toEqual([
      expect.stringMatching(/^manifest-invalid settings\.0\.setting\.default: /),
      expect.stringMatching(/^manifest-invalid settings\.1\.setting: /),
      expect.stringMatching(/^manifest-invalid settings\.2\.setting\.text: /),
      expect.stringMatching(/^manifest-invalid settings\.3\.setting\.link\.href: /),
    ]);
  });

  it('значения: id или адрес, у политики — тип, пусто — "" или null; иначе — текст с id поля по порядку', () => {
    const fields = fieldsOf([PRODUCT, COLLECTION, POSTS, POLICY, PRICE]);
    expect(
      resolveSectionSettings(fields, { product: 'sharf-nova', collection: '', posts: null, policy: 'tos' }),
    ).toEqual({
      values: { product: 'sharf-nova', collection: '', posts: null, policy: 'tos', price: null },
      invalid: [],
    });
    const uuid = '019a2f4e-7c1d-7b3e-9a10-4f2d8e6c1b00';
    expect(resolveSectionSettings(fields, { collection: 'Шарфы_2026', product: uuid }).invalid).toEqual([]);
    const wrong = { product: 'шарф нова', policy: 'about', price: 'Скидка', posts: 7 };
    expect(resolveSectionSettings(fields, wrong).invalid).toEqual([
      'product: нужен id или адрес товара: буквы, цифры, «-» и «_», до 200 знаков, или пусто',
      'policy: нужен тип политики: refund, privacy, tos, shipping или пусто',
      'price: у подсказки значения нет: только null',
      'posts: нужен id или адрес блога: буквы, цифры, «-» и «_», до 200 знаков, или пусто',
    ]);
  });

  // С 29.10 товар и коллекция есть и у блоков («Тип» элемента «Галереи» на проде); подсказка — только у секции.
  it('в блоке: product можно, hint — только у настроек секции, как menu', () => {
    const manifest = manifestOf([], { blocks: { card: { title: 'Карточка', limit: 4, settings: [PRODUCT, PRICE] } } });
    expect(problemsOf(manifest)).toEqual([
      'setting-invalid blocks.card.settings.1: вид hint — только у настроек секции',
    ]);
  });

  it('словарь: product, collection, posts, policy, price — подписи прода; products — отказ', () => {
    const entryOf = (name: string) => NAMES.names.find((item) => item.name === name);
    const names = ['product', 'collection', 'posts', 'policy', 'price'];
    expect(names.map((name) => [name, entryOf(name)?.kinds, entryOf(name)?.label])).toEqual([
      ['product', ['product'], 'Выбор товара'],
      ['collection', ['collection'], 'Выбор коллекции'],
      ['posts', ['blog'], 'Выбор публикации'],
      ['policy', ['policy'], 'Выбор страницы'],
      ['price', ['hint'], 'Стоимость'],
    ]);
    expect(nameIssue('posts', 'blog')).toBeUndefined();
    expect(nameIssue('product', 'string')?.code).toBe('setting-name-kind');
    expect(nameIssue('products', 'product')?.message).toContain('товары — из коллекции, поле `collection`');
  });
});
