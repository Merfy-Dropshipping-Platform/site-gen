import { platformDictionary } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/canonical';
import { LIVE_PARTS, pageBundle, pageParts, placedSections } from '../src/code';
import { parseBuildInputs, type BuildInputs, type CodeSection } from '../src/inputs';
import { NO_SECTIONS, renderPlacedSections, type PageRender } from '../src/sections-render';
import { errorOf, rawInputs } from './support';
import { ASSETS, BADGE, CODE, GEO, HERO, RENDERS, SHELL, codeInputs } from './support-code';

// Что нужно скрипту секции во входах сборки (часть 5в блока 5, script_meta): модули SDK для ctx, части бандла
// страницы и классы скрипта. Строка до 5в — без meta: секция получает все части ядра, как в 5б.
type Meta = NonNullable<CodeSection['meta']>;
const META: Meta = { uses: ['cart'], parts: ['cart'], classes: ['opacity-40'] };
const hexOf = (hash: string | null): string => (hash ?? '').slice('sha256:'.length);

// Входы стенда с ядром и кодом; meta — по имени секции.
function withMeta(metas: Readonly<Record<string, Meta>>, change: (inputs: BuildInputs) => void = () => undefined) {
  return codeInputs((inputs) => {
    inputs.code.sections = inputs.code.sections.map((section) => {
      const meta = metas[section.name];
      return meta === undefined ? section : { ...section, meta };
    });
    change(inputs);
  });
}

const livePage = (): PageRender => ({ sections: { ...NO_SECTIONS, modules: RENDERS }, mode: 'live', code: ASSETS });

async function bundleText(inputs: BuildInputs): Promise<string> {
  const bundle = await pageBundle(inputs, 'home', livePage());
  return new TextDecoder().decode(bundle?.file?.content);
}

describe('meta секции во входах сборки', () => {
  it('meta проходит схему; без meta — входы прежние', () => {
    const inputs = withMeta({ 'shop:cart-badge': META });
    expect(parseBuildInputs(inputs)).toEqual(inputs);
    expect(parseBuildInputs(codeInputs()).code.sections.some((section) => 'meta' in section)).toBe(false);
  });

  it.each([
    ['класс со скобками', { ...META, classes: ['bg-[url(x)]'] }, 'code.sections.2.meta.classes.0'],
    ['часть не имя экспорта ядра', { ...META, parts: ['cart; alert(1)'] }, 'code.sections.2.meta.parts.0'],
    ['модуль не имя экспорта ядра', { ...META, uses: ['Cart'] }, 'code.sections.2.meta.uses.0'],
  ])('inputs-invalid: %s', (_name, meta, path) => {
    const raw = rawInputs((value) =>
      Object.assign(value, {
        shell: SHELL,
        code: {
          ...CODE,
          sections: CODE.sections.map((section) => (section === BADGE ? { ...section, meta } : section)),
        },
      }),
    );
    expect(errorOf(() => parseBuildInputs(raw))).toMatchObject({ code: 'inputs-invalid', path });
  });
});

describe('части бандла страницы', () => {
  it('части ядра — всегда и первыми; потом части из meta, которых в ядре нет, по алфавиту; аналитика — последней', () => {
    const sections = [
      { ...HERO, meta: { uses: [], parts: ['newsletter', 'cart'], classes: [] } },
      { ...BADGE, meta: { uses: ['favorites'], parts: ['favorites', 'auth'], classes: [] } },
      GEO,
    ];
    expect(pageParts(['cart'], sections)).toEqual(['cart', 'auth', 'favorites', 'newsletter', ...LIVE_PARTS]);
    expect(pageParts(['auth', 'cart', 'favorites'], [GEO])).toEqual(['auth', 'cart', 'favorites', 'analytics']);
    expect(pageParts([], [{ ...GEO, meta: { uses: [], parts: ['analytics'], classes: [] } }])).toEqual(['analytics']);
  });

  it('uses секции в бандле — из её meta; секция без meta — все части ядра', async () => {
    const text = await bundleText(
      withMeta({ 'shop:cart-badge': META, 'geo:locate': { ...META, uses: [], parts: [] } }),
    );
    expect(text).toContain(`script:"${hexOf(BADGE.script)}",uses:["cart"]`);
    expect(text).toContain(`script:"${hexOf(GEO.script)}",uses:[]`);
    const reviews = CODE.sections[3]?.script ?? null;
    expect(text).toContain(`script:"${hexOf(reviews)}",uses:["auth","cart","favorites"]`);
  });

  it('часть из meta секции без скрипта (действие SDK в разметке) — в бандле страницы', async () => {
    const onlyCart = (inputs: BuildInputs): void => {
      if (inputs.shell !== null) inputs.shell.parts = ['cart'];
    };
    const without = await bundleText(withMeta({}, onlyCart));
    expect(without).not.toContain('name:"favorites"');
    const withPart = await bundleText(
      withMeta({ 'shop:hero': { uses: [], parts: ['favorites'], classes: [] } }, onlyCart),
    );
    expect(withPart).toContain('name:"favorites"');
    expect(withPart).toContain('name:"analytics"');
  });
});

describe('классы скрипта секции', () => {
  it('у экземпляра — классы из meta; пустой список и секция без meta — без ключа', () => {
    const inputs = withMeta({ 'shop:cart-badge': META, 'reviews:list': { ...META, classes: [] } });
    const placed = placedSections(inputs, 'home');
    expect(placed.map((entry) => [entry.name, entry.classes])).toEqual([
      ['shop:cart-badge', ['opacity-40']],
      ['shop:hero', undefined],
      ['reviews:list', undefined],
      ['reviews:list', undefined],
    ]);
    expect(placed.filter((entry) => 'classes' in entry)).toHaveLength(1);
  });

  it('CSS страницы — и для классов разметки, и для классов скрипта', async () => {
    const module = 'export default 1;';
    const hash = sha256(Buffer.from(module, 'utf8'));
    const page: PageRender = {
      sections: { modules: new Map([[hash, module]]), render: () => Promise.resolve('<p class="flex">Шарфы</p>') },
      mode: 'live',
    };
    const entry = { id: 'match-1', name: 'shop:scarf-match', hash, settings: {} };
    const plain = await renderPlacedSections([entry], platformDictionary, page);
    expect(plain.sectionsCss).toContain('.flex');
    expect(plain.sectionsCss).not.toContain('.opacity-40');
    const scripted = await renderPlacedSections([{ ...entry, classes: ['opacity-40'] }], platformDictionary, page);
    expect(scripted.sectionsCss).toContain('.flex');
    expect(scripted.sectionsCss).toContain('.opacity-40');
  });
});
