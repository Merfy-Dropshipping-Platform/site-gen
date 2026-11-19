import { EXT_VALUE_LIMITS, extValueWants } from '@merfy/storefront-build';
import { sha256 } from '@merfy/storefront-build';
import type { ExtensionStorefront } from '@merfy/storefront-config';
import type { SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codeOf, type CodeContext } from '../src/code';
import { fetchExtValues, type ExtValueRequest } from '../src/ext-values';
import type { LogFields } from '../src/log';

// Значения сторов расширений с prerender в сборке (20.11): чтение у расширений и привязка секции к стору из манифеста.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const ID = '6e6eac54-f6f3-41bf-ada7-0ac55126d7ce';
const OTHER_ID = 'f0c6c004-7c4e-4896-bab8-adfc23ba0f3b';
const CARD = { title: 'Тёплые вещи', cover: 'https://s3.example/cover.png' };

interface Probe {
  request: ExtValueRequest;
  calls: { queue: string; pattern: string; data: unknown; timeoutMs: number }[];
  lines: [string, LogFields | undefined][];
}

function probe(answer: (data: unknown) => Promise<unknown>): Probe {
  const calls: Probe['calls'] = [];
  const lines: Probe['lines'] = [];
  const request: ExtValueRequest = {
    call: (queue, pattern, data, timeoutMs) => {
      calls.push({ queue, pattern, data, timeoutMs });
      return answer(data);
    },
    log: (message, fields) => void lines.push([message, fields]),
  };
  return { request, calls, lines };
}

const payloadSchema = z.object({ name: z.string(), input: z.object({ recordIds: z.array(z.string()) }) });
const payloadOf = (data: unknown) => payloadSchema.parse(data);

const WANT = { ext: 'picks', fn: 'pickCard', recordIds: [ID, OTHER_ID] };
const ok = (data: unknown): Promise<unknown> => Promise.resolve({ success: true, data });

describe('fetchExtValues', () => {
  it('одна пачка recordIds на пару «расширение, функция»: extensions.fn.run, audience storefront, без покупателя', async () => {
    const { request, calls } = probe(() => ok({ [ID]: CARD, [OTHER_ID]: 'x' }));
    const entities = await fetchExtValues(request, SHOP, [WANT]);
    expect(calls).toEqual([
      {
        queue: 'extensions_queue',
        pattern: 'extensions.fn.run',
        data: {
          extensionId: 'picks',
          shopId: SHOP,
          name: 'pickCard',
          input: { recordIds: [ID, OTHER_ID] },
          audience: 'storefront',
        },
        timeoutMs: EXT_VALUE_LIMITS.callMs,
      },
    ]);
    expect(entities.map(({ type, id, data }) => [type, id, data])).toEqual([
      ['ext-value', `picks:pickCard:${ID}`, { value: CARD }],
      ['ext-value', `picks:pickCard:${OTHER_ID}`, { value: 'x' }],
    ]);
  });

  it('записи без значения (нет в ответе, null) — без сущности, остальные на месте', async () => {
    const { request, lines } = probe(() => ok({ [ID]: CARD, [OTHER_ID]: null }));
    const entities = await fetchExtValues(request, SHOP, [WANT]);
    expect(entities.map((entity) => entity.id)).toEqual([`picks:pickCard:${ID}`]);
    expect(lines).toEqual([]);
  });

  it('нет вызовов, когда читать нечего', async () => {
    const { request, calls } = probe(() => ok({}));
    expect(await fetchExtValues(request, SHOP, [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it.each<[string, () => Promise<unknown>, string]>([
    ['отказ расширения', () => Promise.resolve({ success: false, code: 'fn_error' }), 'fn_error'],
    ['срок вышел', () => Promise.reject(new Error('rpc timeout 3000 ms')), 'rpc timeout 3000 ms'],
    ['ответ не по форме', () => Promise.resolve('не json'), ''],
  ])('%s — значений нет, сборка идёт, строка журнала ext-values-failed', async (_title, answer, error) => {
    const { request, lines } = probe(answer);
    expect(await fetchExtValues(request, SHOP, [WANT])).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.[0]).toBe('ext-values-failed');
    expect(String(lines[0]?.[1]?.error)).toContain(error);
  });

  it('сбой одной пары не отнимает значения у другой', async () => {
    const { request } = probe((data) => {
      return payloadOf(data).name === 'pickCard' ? Promise.reject(new Error('упала')) : ok({ [ID]: CARD });
    });
    const entities = await fetchExtValues(request, SHOP, [WANT, { ext: 'picks', fn: 'otherCard', recordIds: [ID] }]);
    expect(entities.map((entity) => entity.id)).toEqual([`picks:otherCard:${ID}`]);
  });

  it('значение больше предела — без сущности и строка ext-value-too-large; остальные на месте', async () => {
    const big = 'ш'.repeat(EXT_VALUE_LIMITS.valueBytes);
    const { request, lines } = probe(() => ok({ [ID]: CARD, [OTHER_ID]: { text: big } }));
    const entities = await fetchExtValues(request, SHOP, [WANT]);
    expect(entities.map((entity) => entity.id)).toEqual([`picks:pickCard:${ID}`]);
    expect(lines.map(([message, fields]) => [message, fields?.id])).toEqual([['ext-value-too-large', OTHER_ID]]);
  });

  it('больше 100 записей — несколько вызовов по 100', async () => {
    const recordIds = Array.from({ length: EXT_VALUE_LIMITS.ids + 5 }, (_, index) => `id${index}`);
    const { request, calls } = probe(() => ok({}));
    await fetchExtValues(request, SHOP, [{ ...WANT, recordIds }]);
    expect(calls.map((call) => payloadOf(call.data).input.recordIds.length)).toEqual([EXT_VALUE_LIMITS.ids, 5]);
  });

  it('вызовов за сборку не больше предела: лишние пропущены со строкой ext-values-skipped', async () => {
    const wants = Array.from({ length: EXT_VALUE_LIMITS.calls + 2 }, (_, index) => ({ ...WANT, fn: `fn${index}` }));
    const { request, calls, lines } = probe(() => ok({}));
    await fetchExtValues(request, SHOP, wants);
    expect(calls).toHaveLength(EXT_VALUE_LIMITS.calls);
    expect(lines).toEqual([['ext-values-skipped', { shopId: SHOP, calls: 2 }]]);
  });
});

// Секция расширения со скриптом: параметр pick вида ext-record и ext в section.json.
const SHELL = { version: '0.1.0', hash: sha256('ядро'), parts: ['auth', 'ext'], code: '' };

function pickRow(ext: unknown): SectionRow {
  const render = 'export default 1; // pick';
  return {
    id: 'picks:pick',
    name: 'picks:pick',
    kind: 'section',
    author: 'shop',
    owner: SHOP,
    release: null,
    sourceHash: sha256('исходник'),
    contentHash: sha256('правка'),
    manifest: {
      sdk: 1,
      name: 'pick',
      kind: 'section',
      title: 'Подборка',
      settings: [
        { id: 'pick', label: 'Подборка', setting: { kind: 'ext-record', ext: 'picks', record: 'pick', default: null } },
      ],
      ...(ext === undefined ? {} : { ext }),
    },
    template: '<p>pick</p>',
    style: '',
    render,
    renderHash: sha256(render),
    script: null,
    scriptHash: null,
    scriptMeta: null,
    warnings: [],
    draft: false,
    published: true,
    createdAt: '2026-10-10T09:00:00.000Z',
  };
}

const DECLARED = { card: { from: 'settings.pick', store: 'pickCard' } };
type StoreSpec = ExtensionStorefront['stores'][string];
const store = (extra: Partial<StoreSpec> = {}): StoreSpec => ({
  fn: 'pickCardFn',
  by: 'record',
  record: 'pick',
  ...extra,
});
const description = (stores: ExtensionStorefront['stores']): CodeContext['extensions'] =>
  new Map([['picks', { stores, methods: {} }]]);

function codeWith(extensions: CodeContext['extensions'], ext: unknown = DECLARED) {
  const logged: [string, LogFields | undefined][] = [];
  const context: CodeContext = { shell: SHELL, shopId: SHOP, log: (m, f) => void logged.push([m, f]), extensions };
  const code = codeOf(
    [pickRow(ext)],
    { home: [{ id: 'pick-1', section: 'picks:pick', settings: { pick: ID } }] },
    context,
  );
  return { code: code.code, logged };
}

describe('ext секции в коде магазина', () => {
  it('стор by: record с prerender — привязка в code.sections[].ext, значения читаются по записи из места', () => {
    const { code, logged } = codeWith(description({ pickCard: store({ prerender: true }) }));
    expect(code.sections[0]?.ext).toEqual({
      card: { field: 'pick', ext: 'picks', store: 'pickCard', fn: 'pickCardFn' },
    });
    expect(extValueWants(code)).toEqual([{ ext: 'picks', fn: 'pickCardFn', recordIds: [ID] }]);
    expect(logged).toEqual([]);
  });

  it('стор без prerender — секция без привязки: значение читает скрипт, как раньше', () => {
    const { code, logged } = codeWith(description({ pickCard: store() }));
    expect('ext' in (code.sections[0] ?? {})).toBe(false);
    expect(extValueWants(code)).toEqual([]);
    expect(logged).toEqual([]);
  });

  it.each<[string, ExtensionStorefront['stores'], string]>([
    ['стора нет в манифесте', {}, 'section-ext-store-missing'],
    [
      'стор не на запись',
      { pickCard: store({ by: 'product', record: undefined, prerender: true }) },
      'section-ext-store-invalid',
    ],
    [
      'стор на другой вид записи',
      { pickCard: store({ record: 'other', prerender: true }) },
      'section-ext-store-invalid',
    ],
  ])('%s — секция без привязки и строка журнала %#', (_title, stores, event) => {
    const { code, logged } = codeWith(description(stores));
    expect('ext' in (code.sections[0] ?? {})).toBe(false);
    expect(logged.map(([message]) => message)).toEqual([event]);
  });

  it('расширения нет среди включённых — строка section-ext-store-missing', () => {
    const { code, logged } = codeWith(new Map());
    expect('ext' in (code.sections[0] ?? {})).toBe(false);
    expect(logged.map(([message]) => message)).toEqual(['section-ext-store-missing']);
  });

  it('пустой ext в section.json — входы и ключ прежние', () => {
    const { code } = codeWith(description({ pickCard: store({ prerender: true }) }), {});
    expect('ext' in (code.sections[0] ?? {})).toBe(false);
  });
});
