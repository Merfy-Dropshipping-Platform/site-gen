import { sha256 } from '@merfy/storefront-build';
import type { SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { EXTENSIONS_QUEUE, codeOf, enabledExtensions, instanceSchema, type CodeContext } from '../src/code';
import type { LogFields } from '../src/log';

// Код магазина из строк реестра и ответ сервиса extensions — без базы и брокера.
const SHELL = { version: '0.1.0', hash: sha256('ядро'), parts: ['auth', 'cart', 'favorites'], code: '' };
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const HEADING = { id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'Тёплые шарфы из кашемира' } };

// Строка реестра SDK 1: секция с модулем рендера или глобальный скрипт; script — текст готового модуля или null.
function row(name: string, kind: SectionRow['kind'], script: string | null): SectionRow {
  const [prefix = '', id = ''] = name.split(':');
  const own = prefix === 'shop';
  const render = kind === 'section' ? `export default 1; // ${name}` : null;
  return {
    id: name,
    name,
    kind,
    author: own ? 'shop' : 'extension',
    owner: own ? SHOP : prefix,
    release: own ? null : '0.0.1',
    sourceHash: sha256(`исходник ${name}`),
    contentHash: sha256(`правка ${name}`),
    manifest: { sdk: 1, name: id, kind, title: name, settings: kind === 'section' ? [HEADING] : [] },
    template: `<p>${name}</p>`,
    style: '',
    render,
    renderHash: render === null ? null : sha256(render),
    script,
    scriptHash: script === null ? null : sha256(script),
    warnings: [],
    draft: false,
    published: own,
    createdAt: '2026-10-10T09:00:00.000Z',
  };
}

const GEO = row('geo:locate', 'global', 'export default {}; // город');
const HERO = row('shop:hero', 'section', null);
const BADGE = row('shop:cart-badge', 'section', 'export default {}; // значок');
const instance = (id: string, section: string, settings: Record<string, unknown> = {}) => ({ id, section, settings });

function contextOf(): { context: CodeContext; logged: [string, LogFields][] } {
  const logged: [string, LogFields][] = [];
  const log = (event: string, fields: LogFields = {}): void => {
    logged.push([event, fields]);
  };
  return { context: { shell: SHELL, shopId: SHOP, log }, logged };
}

describe('codeOf', () => {
  it('экземпляры видимых секций, значения — правки поверх умолчаний; глобальные — все; модули — по отпечатку', () => {
    const { context } = contextOf();
    const placement = {
      home: [
        instance('cart-badge-1', 'shop:cart-badge'),
        instance('list-1', 'reviews:list'),
        instance('hero-1', 'shop:hero', { heading: 'Шарфы к первым холодам' }),
        instance('locate-1', 'geo:locate'),
      ],
      about: [],
    };
    const shop = codeOf([GEO, HERO, BADGE], placement, context);
    expect(shop.code.pages).toEqual({
      home: [
        { id: 'cart-badge-1', section: 'shop:cart-badge', settings: { heading: 'Тёплые шарфы из кашемира' } },
        { id: 'hero-1', section: 'shop:hero', settings: { heading: 'Шарфы к первым холодам' } },
      ],
      about: [],
    });
    expect(shop.code.globals).toEqual(['geo:locate']);
    expect(shop.code.sections.map((section) => [section.name, section.hash, section.render, section.script])).toEqual(
      [GEO, HERO, BADGE].map((source) => [source.name, source.contentHash, source.renderHash, source.scriptHash]),
    );
    expect([...shop.assets.renders.keys()]).toEqual([HERO.renderHash, BADGE.renderHash]);
    expect([...shop.assets.modules.keys()]).toEqual([GEO.scriptHash, BADGE.scriptHash]);
    expect(shop.shell).toEqual({ version: '0.1.0', hash: SHELL.hash, parts: ['auth', 'cart', 'favorites'] });
  });

  it('неверная правка — умолчание и строка журнала section-settings-invalid', () => {
    const { context, logged } = contextOf();
    const shop = codeOf([HERO], { home: [instance('hero-1', 'shop:hero', { heading: 5, color: 'red' })] }, context);
    expect(shop.code.pages.home).toEqual([
      { id: 'hero-1', section: 'shop:hero', settings: { heading: 'Тёплые шарфы из кашемира' } },
    ]);
    expect(logged.map(([event, fields]) => [event, fields.id])).toEqual([['section-settings-invalid', 'hero-1']]);
  });

  it('строка до SDK 1 — её нет в коде, строка журнала section-old-format', () => {
    const { context, logged } = contextOf();
    const old = { ...HERO, manifest: { v: 1, name: 'hero', kind: 'section', title: 'Первый экран', fields: [] } };
    const shop = codeOf([old], { home: [instance('hero-1', 'shop:hero')] }, context);
    expect(shop.code.pages.home).toEqual([]);
    expect(shop.code.sections).toEqual([]);
    expect(logged.map(([event]) => event)).toEqual(['section-old-format']);
  });

  it('секция не стоит ни на одной странице — её нет в коде; скриптов нет — ядро во входах есть (аналитика)', () => {
    const { context } = contextOf();
    const shop = codeOf([HERO, BADGE], { home: [instance('hero-1', 'shop:hero')] }, context);
    expect(shop.code.sections.map((section) => section.name)).toEqual(['shop:hero']);
    expect(shop.shell).toEqual({ version: '0.1.0', hash: SHELL.hash, parts: ['auth', 'cart', 'favorites'] });
    expect(shop.assets.modules.size).toBe(0);
  });

  it('hidden: true — в коде магазина hidden: true (убирает renderShopPage); hidden: false и name в код не идут (Р17)', () => {
    const { context } = contextOf();
    const placement = {
      home: [
        { ...instance('hero-1', 'shop:hero'), hidden: true, name: 'Осенний баннер' },
        { ...instance('hero-2', 'shop:hero'), hidden: false },
      ],
    };
    const shop = codeOf([HERO], placement, context);
    expect(shop.code.pages.home).toEqual([
      { id: 'hero-1', section: 'shop:hero', settings: { heading: 'Тёплые шарфы из кашемира' }, hidden: true },
      { id: 'hero-2', section: 'shop:hero', settings: { heading: 'Тёплые шарфы из кашемира' } },
    ]);
  });

  it('схема экземпляра в ревизии: hidden и name проходят, чужой ключ — нет', () => {
    const base = { id: 'hero-1', section: 'shop:hero', settings: {} };
    expect(instanceSchema.safeParse({ ...base, hidden: true, name: 'Осенний баннер' }).success).toBe(true);
    expect(instanceSchema.safeParse({ ...base, color: 'red' }).success).toBe(false);
  });
});

describe('enabledExtensions', () => {
  const calls: unknown[][] = [];
  const lines: string[] = [];
  const log = (message: string, fields?: LogFields): void => void lines.push(`${message}: ${String(fields?.error)}`);
  const request = (answer: () => Promise<unknown>) => ({
    call: (...args: unknown[]): Promise<unknown> => {
      calls.push(args);
      return answer();
    },
    timeoutMs: 1_500,
    log,
  });

  it('запрос — в extensions_queue с id магазина; ответ — id и версии расширений', async () => {
    const answer = { success: true, data: [{ id: 'reviews', version: '1.4.0', admin: {}, hooks: [] }] };
    expect(
      await enabledExtensions(
        request(() => Promise.resolve(answer)),
        SHOP,
      ),
    ).toEqual([{ id: 'reviews', version: '1.4.0' }]);
    expect(calls).toEqual([[EXTENSIONS_QUEUE, 'extensions.enabledForShop', { shopId: SHOP }, 1_500]]);
  });

  it('неуспех или ошибка — null и строка журнала extensions-failed', async () => {
    const failed = { success: false, code: 'NOT_FOUND', message: 'нет магазина' };
    expect(
      await enabledExtensions(
        request(() => Promise.resolve(failed)),
        SHOP,
      ),
    ).toBeNull();
    expect(
      await enabledExtensions(
        request(() => Promise.reject(new Error('тайм-аут 1500 мс'))),
        SHOP,
      ),
    ).toBeNull();
    expect(lines).toEqual([
      'extensions-failed: extensions.enabledForShop: success = false',
      'extensions-failed: тайм-аут 1500 мс',
    ]);
  });
});

describe('codeOf: блоки секции (часть 3)', () => {
  const QUESTION = {
    title: 'Вопрос',
    limit: 2,
    settings: [
      { id: 'question', label: 'Вопрос', setting: { kind: 'string', default: 'Новый вопрос' } },
      { id: 'answer', label: 'Ответ', setting: { kind: 'richtext', default: '<p>Ответ</p>' } },
    ],
  };
  const FAQ: SectionRow = {
    ...row('shop:faq', 'section', null),
    manifest: {
      sdk: 1,
      name: 'faq',
      kind: 'section',
      title: 'Вопросы и ответы',
      settings: [HEADING],
      blocks: { question: QUESTION },
      defaultBlocks: [{ type: 'question', settings: { question: 'Как стирать кашемир?' } }],
    },
  };

  it('нет ключа blocks — блоки по умолчанию с id <тип>-<n>; у секции без blocks в section.json ключа нет', () => {
    const { context } = contextOf();
    const shop = codeOf(
      [HERO, FAQ],
      { home: [instance('faq-1', 'shop:faq'), instance('hero-1', 'shop:hero')] },
      context,
    );
    expect(shop.code.pages.home).toEqual([
      {
        id: 'faq-1',
        section: 'shop:faq',
        settings: { heading: 'Тёплые шарфы из кашемира' },
        blocks: [
          {
            id: 'question-1',
            type: 'question',
            settings: { question: 'Как стирать кашемир?', answer: '<p>Ответ</p>' },
          },
        ],
      },
      { id: 'hero-1', section: 'shop:hero', settings: { heading: 'Тёплые шарфы из кашемира' } },
    ]);
  });

  it('скрытые, сверх limit и неизвестного типа — не в коде, строка журнала section-blocks-invalid; richtext очищен', () => {
    const { context, logged } = contextOf();
    const blocks = [
      { id: 'question-a', type: 'question', settings: { answer: '<p>Да<script>x()</script></p>' } },
      { id: 'question-b', type: 'question', settings: {}, hidden: true },
      { id: 'question-c', type: 'question', settings: {} },
      { id: 'slide-1', type: 'slide', settings: {} },
    ];
    const shop = codeOf([FAQ], { home: [{ ...instance('faq-1', 'shop:faq'), blocks }] }, context);
    expect(shop.code.pages.home?.[0]?.blocks).toEqual([
      { id: 'question-a', type: 'question', settings: { question: 'Новый вопрос', answer: '<p>Да</p>' } },
    ]);
    expect(logged).toEqual([
      [
        'section-blocks-invalid',
        {
          shopId: SHOP,
          section: 'shop:faq',
          id: 'faq-1',
          problems: 'blocks.2: блоков question больше 2; blocks.3.type: типа slide у секции нет',
        },
      ],
    ]);
  });

  it('ревизия: blocks — список { id, type, settings, hidden? }; другая форма — отказ схемы', () => {
    const base = instance('faq-1', 'shop:faq');
    const block = { id: 'question-1', type: 'question', settings: {} };
    expect(instanceSchema.safeParse({ ...base, blocks: [{ ...block, hidden: true }] }).success).toBe(true);
    expect(instanceSchema.safeParse({ ...base, blocks: [{ ...block, id: 'Question 1' }] }).success).toBe(false);
    expect(instanceSchema.safeParse({ ...base, blocks: [{ ...block, extra: 1 }] }).success).toBe(false);
    expect(instanceSchema.safeParse({ ...base, blocks: {} }).success).toBe(false);
  });
});

describe('codeOf: группы, limit, меню, флаги (часть 4)', () => {
  const MENU = { id: 'menu', label: 'Изменить пункты меню', setting: { kind: 'menu', default: 'main' } };
  const HEADER: SectionRow = {
    ...row('shop:header', 'section', null),
    manifest: {
      sdk: 1,
      name: 'header',
      kind: 'section',
      title: 'Шапка',
      settings: [MENU],
      groups: ['header'],
      limit: 1,
      removable: false,
      uses: ['theme', 'shop'],
    },
  };
  const MENUS = [{ id: 'main', title: 'Главное меню', items: [{ label: 'О нас', url: '/o-nas' }] }];
  const idsOf = (pages: Record<string, readonly { id: string }[]>) =>
    Object.fromEntries(Object.entries(pages).map(([list, items]) => [list, items.map((item) => item.id)]));

  it('шапка — только в списке header и одна; лишняя и не своей группы — строка журнала, сборка идёт', () => {
    const { context, logged } = contextOf();
    const placement = {
      header: [instance('header-1', 'shop:header'), instance('header-2', 'shop:header')],
      home: [instance('header-3', 'shop:header'), instance('hero-1', 'shop:hero')],
      footer: [instance('hero-2', 'shop:hero')],
    };
    const shop = codeOf([HEADER, HERO], placement, context, MENUS);
    expect(idsOf(shop.code.pages)).toEqual({ header: ['header-1'], home: ['hero-1'], footer: [] });
    expect(logged.map(([event, fields]) => [event, fields.id, fields.list])).toEqual([
      ['section-limit-exceeded', 'header-2', 'header'],
      ['section-group-invalid', 'header-3', 'home'],
      ['section-group-invalid', 'hero-2', 'footer'],
    ]);
  });

  it('меню экземпляра — деревом по значению настройки; removable и uses — у секции, как в section.json', () => {
    const { context } = contextOf();
    const shop = codeOf([HEADER], { header: [instance('header-1', 'shop:header')] }, context, MENUS);
    expect(shop.code.pages.header?.[0]?.menus).toEqual({
      menu: { title: 'Главное меню', items: [{ label: 'О нас', url: '/o-nas', items: [] }] },
    });
    expect(shop.code.sections[0]).toMatchObject({ name: 'shop:header', removable: false, uses: ['theme', 'shop'] });
    const plain = codeOf([HERO], { home: [instance('hero-1', 'shop:hero')] }, context);
    expect(plain.code.pages.home?.[0]).not.toHaveProperty('menus');
    expect(plain.code.sections[0]).not.toHaveProperty('removable');
    expect(plain.code.sections[0]).not.toHaveProperty('uses');
  });
});
