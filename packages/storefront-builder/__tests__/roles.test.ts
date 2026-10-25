import { sha256 } from '@merfy/storefront-build';
import type { CurrentSection, SectionRow } from '@merfy/storefront-sections';
import { platformDictionary } from '@merfy/tokens';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { codeOf, type CodeContext } from '../src/code';
import type { LogFields } from '../src/log';
import { shopSections, type ShopPreviewDeps } from '../src/shop-preview';

// Секции с ролью у сборщика (блок 12 «Секций и SDK», 12.1, 12.2, «Решил сам» пп. 5, 7; часть 12а): роль во входах,
// экземпляр — только в списке своей роли и один; ответ /sections — role, place, groups и limit.
const SHELL = { version: '0.1.0', hash: sha256('ядро'), parts: ['cart'], code: '' };
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const instance = (id: string, section: string) => ({ id, section, settings: {} });

function row(name: string, manifest: Record<string, unknown> = {}): SectionRow {
  const id = name.split(':')[1] ?? '';
  const render = `export default 1; // ${name}`;
  return {
    id: name,
    name,
    kind: 'section',
    author: 'shop',
    owner: SHOP,
    release: null,
    sourceHash: sha256(`исходник ${name}`),
    contentHash: sha256(`правка ${name}`),
    manifest: { sdk: 1, name: id, kind: 'section', title: name, settings: [], ...manifest },
    template: `<p>${name}</p>`,
    style: '',
    render,
    renderHash: sha256(render),
    script: null,
    scriptHash: null,
    warnings: [],
    draft: true,
    published: true,
    createdAt: '2026-10-24T09:00:00.000Z',
  };
}

function contextOf(): { context: CodeContext; logged: [string, LogFields][] } {
  const logged: [string, LogFields][] = [];
  const log = (event: string, fields: LogFields = {}): void => {
    logged.push([event, fields]);
  };
  return { context: { shell: SHELL, shopId: SHOP, log }, logged };
}

const idsOf = (pages: Record<string, readonly { id: string }[]>) =>
  Object.fromEntries(Object.entries(pages).map(([list, items]) => [list, items.map((item) => item.id)]));

describe('секции с ролью в коде магазина', () => {
  it('экземпляр — только в списке своей роли и один; лишний и не свой — журнал, сборка идёт; роль во входах', () => {
    const { context, logged } = contextOf();
    const CART = row('shop:cart', { role: 'cart', groups: ['page'], limit: 1 });
    const DRAWER = row('shop:cart-drawer', { role: 'cart-drawer' });
    const HERO = row('shop:hero');
    const placement = {
      overlay: [instance('drawer-1', 'shop:cart-drawer'), instance('drawer-2', 'shop:cart-drawer'), instance('hero-1', 'shop:hero')],
      'page-cart': [instance('cart-1', 'shop:cart')],
      home: [instance('cart-2', 'shop:cart'), instance('drawer-3', 'shop:cart-drawer'), instance('hero-2', 'shop:hero')],
      footer: [instance('drawer-4', 'shop:cart-drawer')],
    };
    const shop = codeOf([CART, DRAWER, HERO], placement, context);
    expect(idsOf(shop.code.pages)).toEqual({ overlay: ['drawer-1'], 'page-cart': ['cart-1'], home: ['hero-2'], footer: [] });
    expect(logged.map(([event, fields]) => [event, fields.id, fields.list])).toEqual([
      ['section-limit-exceeded', 'drawer-2', 'overlay'],
      ['section-group-invalid', 'hero-1', 'overlay'],
      ['section-group-invalid', 'cart-2', 'home'],
      ['section-group-invalid', 'drawer-3', 'home'],
      ['section-group-invalid', 'drawer-4', 'footer'],
    ]);
    expect(shop.code.sections.map((section) => [section.name, section.role])).toEqual([
      ['shop:cart', 'cart'],
      ['shop:cart-drawer', 'cart-drawer'],
      ['shop:hero', undefined],
    ]);
    expect(shop.code.sections[2]).not.toHaveProperty('role');
  });
});

describe('ответ /sections', () => {
  const current = (name: string, manifest: Record<string, unknown> = {}): CurrentSection => ({
    name,
    manifest: { sdk: 1, name: name.split(':')[1] ?? '', kind: 'section', title: name, settings: [], ...manifest },
    render: 'export default 1;',
    renderHash: sha256('export default 1;'),
  });
  const depsOf = (sections: CurrentSection[]): ShopPreviewDeps =>
    ({
      shop: () => Promise.resolve({ shopId: SHOP, dictionary: platformDictionary, inline: (html: string) => html }),
      sections: () => Promise.resolve(new Map(sections.map((section): [string, CurrentSection] => [section.name, section]))),
    }) as Pick<ShopPreviewDeps, 'shop' | 'sections'> as ShopPreviewDeps;

  it('у секции с ролью — role, place, groups и limit: 1 всегда; у секции без роли — прежний ответ', async () => {
    const answer = await shopSections(
      depsOf([
        current('shop:cart', { role: 'cart', groups: ['page'], limit: 1 }),
        current('shop:cart-drawer', { role: 'cart-drawer' }),
        current('shop:hero'),
      ]),
      SHOP,
    );
    const list = z.object({ sections: z.array(z.record(z.string(), z.unknown())) }).parse(JSON.parse(answer.body));
    const placeOf = (item: Record<string, unknown>) => [item.name, item.role, item.place, item.groups, item.limit];
    expect(list.sections.map(placeOf)).toEqual([
      ['shop:cart', 'cart', 'page-cart', ['page'], 1],
      ['shop:cart-drawer', 'cart-drawer', 'overlay', ['overlay'], 1],
      ['shop:hero', undefined, undefined, undefined, undefined],
    ]);
    expect(Object.keys(list.sections[2] ?? {}).sort()).toEqual(['name', 'settings', 'title', 'tokens', 'wrapper']);
  });
});
