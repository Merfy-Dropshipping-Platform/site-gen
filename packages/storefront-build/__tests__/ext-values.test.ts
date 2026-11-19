import { describe, expect, it } from 'vitest';
import { buildKey } from '../src/key';
import {
  EXT_VALUE_LIMITS,
  extDepsOf,
  extValueEntity,
  type ExtValue,
  extValueIndexOf,
  extValueKey,
  extValueWants,
  sectionExt,
  sectionExtTag,
} from '../src/ext-values';
import { parseBuildInputs, type BuildInputs, type CodeInstance, type CodeSection, type Entity } from '../src/inputs';
import { renderShopPage, type ShopTheme } from '../src/page';
import {
  NO_PAGE_PROPS,
  renderSection,
  type PageProps,
  type PageRender,
  type PlacedSection,
  type SectionRenderRequest,
} from '../src/sections-render';
import { errorOf, standInputs } from './support';
import { ASSETS, HERO, RENDERS, codeInputs } from './support-code';
import { fakeRender, novaTokens } from './support-theme';

// Значения сторов расширений с prerender (20.11): сущность снимка, зависимости страницы, свойство шаблона ext и тег
// начальных значений для ядра. Секция — как у расширения «Подборки»: поле pick вида ext-record, стор pickCard.
const [HASH = ''] = [...RENDERS.keys()];
const ID = '6e6eac54-f6f3-41bf-ada7-0ac55126d7ce';
const OTHER_ID = 'f0c6c004-7c4e-4896-bab8-adfc23ba0f3b';
const BINDING = { field: 'pick', ext: 'picks', store: 'pickCard', fn: 'pickCard' };
const CARD = { title: 'Тёплые вещи', cover: 'https://s3.example/cover.png' };

const placed = (settings: PlacedSection['settings'], extra: Partial<PlacedSection> = {}): PlacedSection => ({
  id: 'pick-1',
  name: 'picks:pick',
  hash: HASH,
  settings,
  ext: { card: BINDING },
  script: true,
  ...extra,
});
const lookupOf = (...entries: [string, ExtValue][]) =>
  extValueIndexOf(entries.map(([id, value]) => extValueEntity('picks', 'pickCard', id, value)));

describe('значения стора расширения для секции', () => {
  it('значение записи из поля — в values, в seeds для ядра и в зависимостях страницы', () => {
    const found = sectionExt(placed({ pick: ID }), lookupOf([ID, CARD]));
    expect(found.values).toEqual({ card: CARD });
    expect(found.seeds).toEqual([{ ext: 'picks', store: 'pickCard', id: ID, value: CARD }]);
    expect(found.deps).toEqual([extValueKey('picks', 'pickCard', ID)]);
  });

  it.each<[string, PlacedSection['settings'], ReturnType<typeof lookupOf>]>([
    ['запись не выбрана', { pick: null }, lookupOf([ID, CARD])],
    ['id не по правилу', { pick: 'a b' }, lookupOf([ID, CARD])],
    ['значения нет в снимке', { pick: ID }, lookupOf([OTHER_ID, CARD])],
  ])('%s — null, секция рисуется как раньше', (_title, settings, lookup) => {
    const found = sectionExt(placed(settings), lookup);
    expect(found).toEqual({ values: { card: null }, seeds: [], deps: [] });
  });

  it('нет индекса значений — null', () => {
    expect(sectionExt(placed({ pick: ID })).values).toEqual({ card: null });
  });

  it('секции без ext нечего отдавать', () => {
    expect(sectionExt({ settings: { pick: ID } }, lookupOf([ID, CARD]))).toEqual({ values: {}, seeds: [], deps: [] });
  });

  it('зависимости нескольких секций — без повторов', () => {
    const both = [placed({ pick: ID }), placed({ pick: ID }, { id: 'pick-2' })];
    expect(extDepsOf(both, lookupOf([ID, CARD]))).toEqual([extValueKey('picks', 'pickCard', ID)]);
  });
});

describe('что читать у расширений', () => {
  const sections: CodeSection[] = [{ ...HERO, name: 'picks:pick', ext: { card: BINDING } }];
  const instance = (id: string, pick: string | null, hidden?: true): CodeInstance => ({
    id,
    section: 'picks:pick',
    settings: { pick },
    ...(hidden === undefined ? {} : { hidden }),
  });

  it('записи всех страниц одной пачкой на пару «расширение, функция», без повторов и по порядку', () => {
    const code = {
      sections,
      pages: { home: [instance('a', OTHER_ID), instance('b', ID)], 'page-x': [instance('c', ID)] },
    };
    expect(extValueWants(code)).toEqual([{ ext: 'picks', fn: 'pickCard', recordIds: [OTHER_ID, ID].sort() }]);
  });

  it('скрытые экземпляры, пустые и негодные id не читаются', () => {
    const code = {
      sections,
      pages: { home: [instance('a', ID, true), instance('b', null), instance('c', ''), instance('d', 'a b')] },
    };
    expect(extValueWants(code)).toEqual([]);
  });

  it('секция без ext ничего не просит', () => {
    const code = { sections: [HERO], pages: { home: [instance('a', ID)] } };
    expect(extValueWants({ ...code, sections: [{ ...HERO, name: 'picks:pick' }] })).toEqual([]);
  });
});

describe('тег начальных значений', () => {
  it('{ расширение: { стор: { id: значение } } } в теге data-merfy-ext', () => {
    const tag = sectionExtTag([
      { ext: 'picks', store: 'pickCard', id: ID, value: CARD },
      { ext: 'picks', store: 'pickCard', id: OTHER_ID, value: 'x' },
    ]);
    expect(tag.startsWith('<script type="application/json" data-merfy-ext>')).toBe(true);
    const json = tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    expect(JSON.parse(json)).toEqual({ picks: { pickCard: { [ID]: CARD, [OTHER_ID]: 'x' } } });
  });

  it('«</script>» в значении тег не закрывает', () => {
    const tag = sectionExtTag([{ ext: 'picks', store: 'pickCard', id: ID, value: { html: '</script><b>' } }]);
    expect(tag.split('</script>')).toHaveLength(2);
  });

  it('значений нет или не влезло в 32 КБ — тега нет, секция не падает', () => {
    expect(sectionExtTag([])).toBe('');
    const big = ['a'.repeat(20_000), 'b'.repeat(20_000)].map((value, index) => ({
      ext: 'picks',
      store: 'pickCard',
      id: `id${index}`,
      value,
    }));
    expect(sectionExtTag(big)).toBe('');
  });
});

describe('секция на странице', () => {
  const requests: SectionRenderRequest[] = [];
  const sections = {
    modules: RENDERS,
    render: (request: SectionRenderRequest) => {
      requests.push(request);
      return Promise.resolve('<h2>card</h2>');
    },
  };
  const props = (...entries: [string, ExtValue][]): PageProps => ({
    ...NO_PAGE_PROPS,
    extValues: lookupOf(...entries),
  });

  it('шаблон получает ext.<имя>, тег значений идёт сразу за тегом входных данных', async () => {
    requests.length = 0;
    const html = await renderSection(placed({ pick: ID }), sections, 'live', undefined, props([ID, CARD]));
    expect(requests[0]?.ext).toEqual({ card: CARD });
    expect(html).toMatch(
      /<script [^>]*data-merfy-input>.*<\/script><script [^>]*data-merfy-ext>.*<\/script><\/merfy-section>$/,
    );
  });

  it('значения нет — ext.<имя> = null и тега нет', async () => {
    requests.length = 0;
    const html = await renderSection(placed({ pick: ID }), sections, 'live', undefined, props());
    expect(requests[0]?.ext).toEqual({ card: null });
    expect(html).not.toContain('data-merfy-ext');
  });

  it('секция без ext — запрос без ключа ext', async () => {
    requests.length = 0;
    await renderSection(placed({ pick: ID }, { ext: undefined }), sections, 'live', undefined, props([ID, CARD]));
    expect(requests[0]).not.toHaveProperty('ext');
  });

  it('секция без скрипта — значение в шаблоне, тега для ядра нет', async () => {
    requests.length = 0;
    const html = await renderSection(
      placed({ pick: ID }, { script: false }),
      sections,
      'live',
      undefined,
      props([ID, CARD]),
    );
    expect(requests[0]?.ext).toEqual({ card: CARD });
    expect(html).not.toContain('data-merfy-ext');
  });
});

describe('страница целиком', () => {
  const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
  const requests: SectionRenderRequest[] = [];
  const page: PageRender = {
    sections: {
      modules: RENDERS,
      render: (request) => {
        requests.push(request);
        return Promise.resolve(`<h2>${request.section}</h2>`);
      },
    },
    mode: 'live',
    code: ASSETS,
  };
  const inputsWith = (entities: Entity[]): BuildInputs =>
    codeInputs((inputs) => {
      const hero = inputs.code.sections.find((section) => section.name === HERO.name);
      if (hero !== undefined) hero.ext = { card: BINDING };
      const instance = inputs.code.pages.home?.find((item) => item.section === HERO.name);
      if (instance !== undefined) instance.settings = { pick: ID };
      inputs.data.entities.push(...entities);
    });

  it('значение в снимке — шаблону в ext, его ключ — в зависимостях строки страницы', async () => {
    requests.length = 0;
    const rendered = await renderShopPage(
      inputsWith([extValueEntity('picks', 'pickCard', ID, CARD)]),
      '/',
      theme,
      page,
    );
    expect(requests.find((request) => request.section === HERO.name)?.ext).toEqual({ card: CARD });
    expect(rendered.row.deps).toContain(extValueKey('picks', 'pickCard', ID));
  });

  it('значения в снимке нет — ext.card = null и ключа в зависимостях нет', async () => {
    requests.length = 0;
    const rendered = await renderShopPage(inputsWith([]), '/', theme, page);
    expect(requests.find((request) => request.section === HERO.name)?.ext).toEqual({ card: null });
    expect(rendered.row.deps.some((dep) => dep.startsWith('ext-value:'))).toBe(false);
  });
});

describe('входы сборки', () => {
  const entity = extValueEntity('picks', 'pickCard', ID, CARD);
  const withEntity = (value: ExtValue): BuildInputs =>
    parseBuildInputs({
      ...standInputs,
      data: {
        ...standInputs.data,
        entities: [...standInputs.data.entities, extValueEntity('picks', 'pickCard', ID, value)],
      },
    });

  it('сущность ext-value годится, дата правки постоянная', () => {
    expect(entity).toMatchObject({
      type: 'ext-value',
      id: `picks:pickCard:${ID}`,
      updatedAt: '1970-01-01T00:00:00.000Z',
    });
    expect(withEntity(CARD).data.entities.at(-1)).toEqual(entity);
  });

  it('значение изменилось — другой ключ сборки; то же значение — тот же', () => {
    expect(buildKey(withEntity(CARD))).toBe(buildKey(withEntity({ ...CARD })));
    expect(buildKey(withEntity(CARD))).not.toBe(buildKey(withEntity({ ...CARD, title: 'Другое' })));
    expect(buildKey(withEntity(CARD))).not.toBe(buildKey(standInputs));
  });

  const withExt = (ext: unknown): unknown => {
    const raw = structuredClone(codeInputs());
    Object.assign(raw.code.sections.find((section) => section.name === HERO.name) ?? {}, { ext });
    return raw;
  };

  it('ext у секции в коде — часть входов и ключа, чужая форма — ошибка', () => {
    const parsed = parseBuildInputs(withExt({ card: BINDING }));
    expect(parsed.code.sections.find((section) => section.name === HERO.name)).toMatchObject({
      ext: { card: BINDING },
    });
    expect(buildKey(parsed)).not.toBe(buildKey(codeInputs()));
    expect(errorOf(() => parseBuildInputs(withExt({ card: { ...BINDING, fn: 'bad name' } }))).code).toBe(
      'inputs-invalid',
    );
    expect(errorOf(() => parseBuildInputs(withExt({ Card: BINDING }))).code).toBe('inputs-invalid');
    const tooMany = Object.fromEntries(
      Array.from({ length: EXT_VALUE_LIMITS.names + 1 }, (_, index) => [`card${index}`, BINDING]),
    );
    expect(errorOf(() => parseBuildInputs(withExt(tooMany))).code).toBe('inputs-invalid');
  });
});
