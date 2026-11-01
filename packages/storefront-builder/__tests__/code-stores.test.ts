import { sha256 } from '@merfy/storefront-build';
import type { SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { codeOf, type CodeContext } from '../src/code';
import type { LogFields } from '../src/log';

// Свои сторы в коде магазина (свои сторы, 01.11): стор идёт во входы сборки, только когда его читает стоящая секция,
// глобальный скрипт или другой такой стор; стора нет среди видимых (свой не опубликован, расширение выключено) — строка
// журнала section-store-missing, сборка идёт. Строки — как их пишет приём: uses — в script_meta.
const SHELL = { version: '0.1.0', hash: sha256('ядро'), parts: ['auth', 'cart', 'favorites'], code: '' };
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';

function row(name: string, kind: SectionRow['kind'], uses: readonly string[] = []): SectionRow {
  const [author = '', id = ''] = name.split(':');
  const render = kind === 'section' ? `export default 1; // ${name}` : null;
  const script = `export default {}; // ${name}`;
  return {
    id: name,
    name,
    kind,
    author: author === 'shop' ? 'shop' : 'extension',
    owner: author === 'shop' ? SHOP : author,
    release: author === 'shop' ? null : '0.1.0',
    sourceHash: sha256(`исходник ${name}`),
    contentHash: sha256(`правка ${name}`),
    manifest: { sdk: 1, name: id, kind, title: name, settings: [], uses },
    template: kind === 'section' ? `<p>${name}</p>` : '',
    style: '',
    render,
    renderHash: render === null ? null : sha256(render),
    script,
    scriptHash: sha256(script),
    scriptMeta: { uses, parts: [], classes: [] },
    warnings: [],
    draft: false,
    published: author === 'shop',
    createdAt: '2026-11-01T09:00:00.000Z',
  };
}

function contextOf() {
  const logged: [string, LogFields][] = [];
  const log = (event: string, fields: LogFields = {}): void => void logged.push([event, fields]);
  const context: CodeContext = { shell: SHELL, shopId: SHOP, log };
  return { context, logged };
}

const placed = (id: string, section: string) => ({ id, section, settings: {} });
const ROWS = [
  row('shop:popup', 'section', ['store:shop:offer']),
  row('shop:offer', 'store', ['cart', 'store:shop:has-items', 'store:popups:seen']),
  row('shop:has-items', 'store', ['cart']),
  row('popups:seen', 'store'),
  row('shop:unused', 'store'),
];

describe('codeOf: свои сторы', () => {
  it('стоящая секция читает offer, offer — has-items и стор расширения: все три во входах, unused — нет', () => {
    const { context, logged } = contextOf();
    const shop = codeOf(ROWS, { home: [placed('popup-1', 'shop:popup')] }, context);
    expect(shop.code.sections.map((section) => [section.name, section.kind, section.render])).toEqual([
      ['shop:popup', 'section', sha256('export default 1; // shop:popup')],
      ['shop:offer', 'store', null],
      ['shop:has-items', 'store', null],
      ['popups:seen', 'store', null],
    ]);
    expect(shop.code.globals).toEqual([]);
    expect([...shop.assets.modules.keys()]).toHaveLength(4);
    expect(logged).toEqual([]);
  });

  it('секция не стоит на страницах — её сторов во входах нет', () => {
    const { context } = contextOf();
    expect(codeOf(ROWS, { home: [] }, context).code.sections).toEqual([]);
  });

  it('глобальный скрипт читает стор — стор во входах', () => {
    const { context } = contextOf();
    const shop = codeOf([row('shop:geo', 'global', ['store:shop:unused']), ...ROWS], { home: [] }, context);
    expect(shop.code.sections.map((section) => section.name)).toEqual(['shop:geo', 'shop:unused']);
  });

  it('стора нет среди видимых (выключенное расширение) — строка журнала, секция во входах, сборка идёт', () => {
    const { context, logged } = contextOf();
    const rows = ROWS.filter((item) => item.name !== 'popups:seen');
    const shop = codeOf(rows, { home: [placed('popup-1', 'shop:popup')] }, context);
    expect(shop.code.sections.map((section) => section.name)).toEqual(['shop:popup', 'shop:offer', 'shop:has-items']);
    expect(logged).toEqual([['section-store-missing', { shopId: SHOP, section: 'shop:offer', store: 'popups:seen' }]]);
  });

  it('стор на месте секции в ревизии на страницу не встаёт', () => {
    const { context } = contextOf();
    const shop = codeOf(ROWS, { home: [placed('offer-1', 'shop:offer')] }, context);
    expect(shop.code.pages).toEqual({ home: [] });
    expect(shop.code.sections).toEqual([]);
  });
});
