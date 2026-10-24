import { sha256 } from '@merfy/storefront-build';
import type { SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { codeOf, instanceSchema, type CodeContext } from '../src/code';
import type { LogFields } from '../src/log';

// Вид обёртки экземпляра в коде магазина (часть 5 блока 1 «Секций и SDK», Р1-5-6…Р1-5-8).
const SHELL = { version: '0.1.0', hash: sha256('ядро'), parts: ['cart'], code: '' };
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const FIELD = { id: 'heading', label: 'Заголовок', setting: { kind: 'string', default: 'Шарфы' } };

function row(name: string, manifest: Record<string, unknown>): SectionRow {
  const [prefix = '', id = ''] = name.split(':');
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
    manifest: { sdk: 1, name: id || prefix, kind: 'section', title: name, settings: [FIELD], ...manifest },
    template: `<p>${name}</p>`,
    style: '',
    render,
    renderHash: sha256(render),
    script: null,
    scriptHash: null,
    warnings: [],
    draft: false,
    published: true,
    createdAt: '2026-10-10T09:00:00.000Z',
  };
}

const HERO = row('shop:hero', {});
const BANNER = row('shop:banner', { wrapper: ['scheme'] });
const NONE = row('shop:plain', { wrapper: [] });

function contextOf(): { context: CodeContext; logged: [string, LogFields][] } {
  const logged: [string, LogFields][] = [];
  const log = (event: string, fields: LogFields = {}): void => {
    logged.push([event, fields]);
  };
  return { context: { shell: SHELL, shopId: SHOP, log }, logged };
}
const instance = (id: string, section: string, wrapper?: unknown) => ({
  id,
  section,
  settings: {},
  ...(wrapper === undefined ? {} : { wrapper }),
});
const placed = (rows: SectionRow[], list: unknown[]) => {
  const { context, logged } = contextOf();
  const shop = codeOf(rows, { home: list.map((item) => instanceSchema.parse(item)) }, context);
  return { instances: shop.code.pages.home ?? [], logged };
};

describe('wrapper экземпляра в коде магазина', () => {
  it('правки схемы и отступов — классы color-scheme-2 pt-10 pb-20 во входах', () => {
    const { instances } = placed(
      [HERO],
      [instance('hero-1', 'shop:hero', { scheme: 'scheme-2', padding: { top: 40, bottom: 80 } })],
    );
    expect(instances[0]?.wrapper).toEqual({ classes: ['color-scheme-2', 'pt-10', 'pb-20'], attributes: {} });
  });

  it('вид по умолчанию — ключа wrapper во входах нет (входы и ключ сборки прежние)', () => {
    const { instances } = placed(
      [HERO],
      [instance('hero-1', 'shop:hero'), instance('hero-2', 'shop:hero', { padding: null })],
    );
    expect(instances.map((item) => 'wrapper' in item)).toEqual([false, false]);
  });

  it('секция без padding в списке: отступа нет, значение padding отброшено с журналом', () => {
    const { instances, logged } = placed(
      [BANNER, NONE],
      [
        instance('banner-1', 'shop:banner', { scheme: 'scheme-1', padding: { top: 40, bottom: 40 } }),
        instance('plain-1', 'shop:plain'),
      ],
    );
    expect(instances[0]?.wrapper).toEqual({ classes: ['color-scheme-1'], attributes: {} });
    expect(instances[1]?.wrapper).toEqual({ classes: [], attributes: {} });
    expect(logged.map(([event, fields]) => [event, fields.id])).toEqual([['section-wrapper-invalid', 'banner-1']]);
  });

  it('неверное значение — вид по умолчанию и строка журнала; сборка идёт', () => {
    const { instances, logged } = placed(
      [HERO],
      [instance('hero-1', 'shop:hero', { padding: { top: 41, bottom: 0 } })],
    );
    expect('wrapper' in (instances[0] ?? {})).toBe(false);
    expect(logged.map(([event]) => event)).toEqual(['section-wrapper-invalid']);
  });

  it('форма экземпляра в ревизии: wrapper — объект; не объект — отказ', () => {
    expect(instanceSchema.safeParse(instance('hero-1', 'shop:hero', { scheme: 'scheme-2' })).success).toBe(true);
    expect(instanceSchema.safeParse(instance('hero-1', 'shop:hero', 'scheme-2')).success).toBe(false);
  });
});
