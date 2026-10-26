import { describe, expect, it } from 'vitest';
import { sha256, type ShellBuild } from '@merfy/storefront-build';
import type { SectionRow } from '@merfy/storefront-sections';
import { codeOf, extPointPartsOf, type CodeContext, type EnabledExtension } from '../src/code';

// Строка реестра SDK 1 без скрипта, своя секция магазина.
const row = (name: string): SectionRow => {
  const [prefix = '', id = ''] = name.split(':');
  const own = prefix === 'shop';
  return {
    id: name,
    name,
    kind: 'section',
    author: own ? 'shop' : 'extension',
    owner: own ? SHOP : prefix,
    release: own ? null : '0.0.1',
    sourceHash: sha256(`исходник ${name}`),
    contentHash: sha256(`правка ${name}`),
    manifest: { sdk: 1, name: id, kind: 'section', title: name, settings: [] },
    template: `<p>${name}</p>`,
    style: '',
    render: `export default 1; // ${name}`,
    renderHash: sha256(`export default 1; // ${name}`),
    script: null,
    scriptHash: null,
    warnings: [],
    draft: false,
    published: own,
    createdAt: '2026-10-10T09:00:00.000Z',
  };
};

// Части точек расширений по включённым местам (блок 15, часть 15г): место product включённого расширения (форма
// покупки товара, storefront.product.form — как в карте /store/extensions/storefront) добавляет часть purchase в
// бандл каждой страницы магазина — карточки каталога без места тоже прячут «В корзину». Имени расширения в коде нет.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const CORE = ['export const start = () => undefined;', "export const purchase = { name: 'purchase' };"].join('\n');
const SHELL: ShellBuild = {
  version: '0.1.0',
  hash: sha256(CORE),
  parts: ['auth', 'cart', 'favorites'],
  code: CORE,
};

function contextOf(extPointParts?: readonly string[]): CodeContext {
  return {
    shell: SHELL,
    shopId: SHOP,
    log: (): void => undefined,
    ...(extPointParts === undefined ? {} : { extPointParts }),
  };
}

const enabled = (storefront: unknown): EnabledExtension => ({ id: 'ext-1', version: '1.0.0', storefront });

describe('extPointPartsOf: части точек по включённым местам', () => {
  it.each([
    ['место product с функцией формы', [enabled({ product: { form: 'productForm', submit: 'submit' } })], ['purchase']],
    ['форма — пустая строка', [enabled({ product: { form: '' } })], []],
    ['места нет, только сторы и методы', [enabled({ stores: {}, methods: {} })], []],
    ['storefront не объект', [enabled('мусор')], []],
    ['место у второго из двух', [enabled({}), enabled({ product: { form: 'productForm' } })], ['purchase']],
  ])('%s — %s', (_name, list, expected) => {
    expect(extPointPartsOf(list)).toEqual(expected);
  });
});

describe('codeOf: части точек расширений в коде магазина', () => {
  it('место включено — extPointParts во входах кода; выключено — поля нет', () => {
    const withPlace = codeOf([row('shop:hero')], {}, contextOf(['purchase']));
    expect(withPlace.code.extPointParts).toEqual(['purchase']);
    const withoutPlace = codeOf([row('shop:hero')], {}, contextOf());
    expect('extPointParts' in withoutPlace.code).toBe(false);
  });
});
