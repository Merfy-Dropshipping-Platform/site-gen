import { prepareSection } from '@merfy/storefront-sections';
import type { AcceptResult, Door, PrepareResult, SectionFiles, SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it, vi } from 'vitest';
import type { DrawAnswer } from '../src/draw';
import { EXTENSION_SECTION_ROUTE, extensionSection } from '../src/extension-section';
import type { SectionToolsDeps } from '../src/section-tools';

// Вход сборщика для секций расширений (блок 12 «Секций и SDK», часть 12б). Расширение — test-ext «Отзывы-тест».
const SECTION_JSON = JSON.stringify({ sdk: 1, name: 'reviews', kind: 'section', title: 'Отзывы' });
const FILES: SectionFiles = { 'section.json': SECTION_JSON, 'template.astro': '<div></div>' };
const ROW: SectionRow = {
  id: '0b5d7f0e-4c1a-4f7e-9a51-6d2a8e3c9b10',
  name: 'test-ext:reviews',
  kind: 'section',
  author: 'extension',
  owner: 'test-ext',
  release: '0.1.0',
  sourceHash: 'a'.repeat(64),
  contentHash: 'b'.repeat(64),
  manifest: {},
  template: '<div></div>',
  style: '',
  render: null,
  renderHash: null,
  script: null,
  scriptHash: null,
  warnings: [],
  draft: false,
  published: false,
  createdAt: '2026-10-24T00:00:00.000Z',
};

interface Probe {
  deps: SectionToolsDeps;
  accept: ReturnType<typeof vi.fn<(door: Door, files: SectionFiles) => Promise<AcceptResult>>>;
  log: ReturnType<typeof vi.fn>;
}

function probe(result: AcceptResult | Error = { status: 'accepted', row: ROW }, open = true): Probe {
  const accept = vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
  const log = vi.fn();
  const deps: SectionToolsDeps = {
    shop: vi.fn(() => Promise.resolve(null)),
    open: () => open,
    check: vi.fn(),
    accept,
    source: vi.fn(() => Promise.resolve(null)),
    history: vi.fn(() => Promise.resolve([])),
    errors: vi.fn(() => Promise.resolve([])),
    rollback: vi.fn(() => Promise.resolve(null)),
    log,
  };
  return { deps, accept, log };
}

const QUERY = { extension: 'test-ext', release: '0.1.0', kind: 'section', name: 'reviews' };
const urlOf = (query: Record<string, string> = QUERY): URL =>
  new URL(`http://builder${EXTENSION_SECTION_ROUTE}?${new URLSearchParams(query).toString()}`);
const send = (deps: SectionToolsDeps, body: unknown = { files: FILES }, url = urlOf(), method = 'POST') =>
  extensionSection(deps, method, url, () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)));
const json = (answer: DrawAnswer): unknown => JSON.parse(String(answer.body));

describe('POST /sections/extension', () => {
  it('сохраняет способом extension: id расширения и версия из адреса; 200 с полным именем и id строки', async () => {
    const { deps, accept } = probe();
    const answer = await send(deps);
    expect(answer.status).toBe(200);
    expect(json(answer)).toEqual({ ok: true, status: 'accepted', name: 'test-ext:reviews', id: ROW.id });
    expect(accept).toHaveBeenCalledWith({ author: 'extension', extension: 'test-ext', release: '0.1.0' }, FILES);
  });

  it('та же версия с теми же файлами — 200 unchanged', async () => {
    const { deps } = probe({ status: 'unchanged', row: ROW });
    expect(json(await send(deps))).toEqual({ ok: true, status: 'unchanged', name: 'test-ext:reviews', id: ROW.id });
  });

  it('отказ проверки — 422 с проблемами приёма', async () => {
    const problems = [
      { code: 'release-changed' as const, file: '', line: null, column: null, message: 'выпуск 0.1.0 уже принят' },
    ];
    const { deps, log } = probe({ status: 'refused', problems });
    const answer = await send(deps);
    expect(answer.status).toBe(422);
    expect(json(answer)).toMatchObject({
      ok: false,
      problems: [{ code: 'release-changed', message: 'выпуск 0.1.0 уже принят' }],
    });
    expect(log).toHaveBeenCalledWith('extension-section-refused', {
      extension: 'test-ext',
      release: '0.1.0',
      name: 'reviews',
      codes: 'release-changed',
    });
  });

  it('name в section.json не тот — 422 manifest-invalid, приём не зовётся', async () => {
    const { deps, accept } = probe();
    const answer = await send(deps, { files: FILES }, urlOf({ ...QUERY, name: 'top-10' }));
    expect(answer.status).toBe(422);
    expect(json(answer)).toMatchObject({
      ok: false,
      problems: [
        { code: 'manifest-invalid', message: 'name в section.json — «reviews», в манифесте расширения — «top-10»' },
      ],
    });
    expect(accept).not.toHaveBeenCalled();
  });

  it('kind в section.json не тот — 422 manifest-invalid', async () => {
    const { deps } = probe();
    const answer = await send(deps, { files: FILES }, urlOf({ ...QUERY, kind: 'global' }));
    expect(json(answer)).toMatchObject({
      problems: [{ message: 'kind в section.json — «section», а в манифесте расширения секция в storefront.globals' }],
    });
  });

  // Свои сторы: стор расширения приходит с kind=store из storefront.scriptStores манифеста.
  it('kind=store, а в section.json секция — 422 manifest-invalid со списком storefront.scriptStores', async () => {
    const { deps, accept } = probe();
    const answer = await send(deps, { files: FILES }, urlOf({ ...QUERY, kind: 'store' }));
    expect(answer.status).toBe(422);
    expect(json(answer)).toMatchObject({
      problems: [
        { message: 'kind в section.json — «section», а в манифесте расширения секция в storefront.scriptStores' },
      ],
    });
    expect(accept).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, string>]>([
    ['занятое имя shop', { ...QUERY, extension: 'shop' }],
    ['версия не semver', { ...QUERY, release: '0.1' }],
    ['вид page', { ...QUERY, kind: 'page' }],
    ['имя с двоеточием', { ...QUERY, name: 'test-ext:reviews' }],
    ['нет версии', { extension: 'test-ext', kind: 'section', name: 'reviews' }],
    ['лишний ключ shop', { ...QUERY, shop: '3a9626f7-390d-4a66-bca5-a3b806ca6c1b' }],
  ])('%s — 400 name-invalid, приём не зовётся', async (_title, query) => {
    const { deps, accept } = probe();
    const answer = await send(deps, { files: FILES }, urlOf(query));
    expect(answer.status).toBe(400);
    expect(json(answer)).toMatchObject({ ok: false, error: { code: 'name-invalid' } });
    expect(accept).not.toHaveBeenCalled();
  });

  it.each<[string, unknown]>([
    ['не JSON', 'files'],
    ['без files', { sections: {} }],
    ['лишний ключ', { files: FILES, shopId: 'x' }],
  ])('тело %s — 400 body-invalid', async (_title, body) => {
    const { deps } = probe();
    const answer = await send(deps, body);
    expect(answer.status).toBe(400);
    expect(json(answer)).toMatchObject({ error: { code: 'body-invalid' } });
  });

  it('песочница не закрыта — 503 uploads-closed, тело не читается', async () => {
    const { deps, accept } = probe(undefined, false);
    const body = vi.fn(() => Promise.resolve(JSON.stringify({ files: FILES })));
    const answer = await extensionSection(deps, 'POST', urlOf(), body);
    expect(answer.status).toBe(503);
    expect(json(answer)).toMatchObject({ error: { code: 'uploads-closed' } });
    expect(body).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });

  describe('dryRun=1: та же проверка, без записи', () => {
    const DRY = { ...QUERY, dryRun: '1' };
    // Настоящий итог проверки секции test-ext:reviews (prepareSection), а не подделка его формы.
    const checked = (): Promise<PrepareResult> =>
      prepareSection({
        prefix: 'test-ext',
        files: { 'section.json': SECTION_JSON, 'template.astro': '<div class="m-0"></div>' },
      });
    const withCheck = (result: PrepareResult | Error) => {
      const made = probe();
      const check = vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
      return { ...made, check, deps: { ...made.deps, check } };
    };

    it('годные файлы — 200 checked с полным именем, приём не зовётся, запись не делается', async () => {
      const { deps, accept, check, log } = withCheck(await checked());
      const answer = await send(deps, { files: FILES }, urlOf(DRY));
      expect(answer.status).toBe(200);
      expect(json(answer)).toEqual({ ok: true, status: 'checked', name: 'test-ext:reviews' });
      expect(check).toHaveBeenCalledWith({ author: 'extension', extension: 'test-ext', release: '0.1.0' }, FILES);
      expect(accept).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('extension-section-checked', {
        extension: 'test-ext',
        release: '0.1.0',
        name: 'reviews',
      });
    });

    it('отказ проверки — 422 с теми же проблемами, что у приёма (код, файл, строка)', async () => {
      const problems = [
        {
          code: 'list-template-missing' as const,
          file: 'script.ts',
          line: 98,
          column: 24,
          message: 'list на ref «lines»',
        },
      ];
      const { deps, accept } = withCheck({ ok: false, problems });
      const answer = await send(deps, { files: FILES }, urlOf(DRY));
      expect(answer.status).toBe(422);
      expect(json(answer)).toMatchObject({
        ok: false,
        problems: [{ code: 'list-template-missing', file: 'script.ts', line: 98, column: 24 }],
      });
      expect(accept).not.toHaveBeenCalled();
    });

    it('name в section.json не тот — тот же 422 manifest-invalid, проверка не зовётся', async () => {
      const { deps, check } = withCheck(await checked());
      const answer = await send(deps, { files: FILES }, urlOf({ ...DRY, name: 'top-10' }));
      expect(answer.status).toBe(422);
      expect(json(answer)).toMatchObject({ problems: [{ code: 'manifest-invalid' }] });
      expect(check).not.toHaveBeenCalled();
    });

    it('песочница не закрыта — 503 uploads-closed, как у приёма', async () => {
      const { deps, check } = withCheck(await checked());
      const closed = { ...deps, open: () => false };
      const answer = await send(closed, { files: FILES }, urlOf(DRY));
      expect(answer.status).toBe(503);
      expect(json(answer)).toMatchObject({ error: { code: 'uploads-closed' } });
      expect(check).not.toHaveBeenCalled();
    });

    it('проверка упала — 500 tool-failed', async () => {
      const { deps } = withCheck(new Error('процесс проверки упал'));
      const answer = await send(deps, { files: FILES }, urlOf(DRY));
      expect(answer.status).toBe(500);
      expect(json(answer)).toMatchObject({ error: { code: 'tool-failed' } });
    });

    it.each(['0', 'yes', ''])('dryRun=%j — 400 name-invalid', async (value) => {
      const { deps, check, accept } = withCheck(await checked());
      const answer = await send(deps, { files: FILES }, urlOf({ ...QUERY, dryRun: value }));
      expect(answer.status).toBe(400);
      expect(check).not.toHaveBeenCalled();
      expect(accept).not.toHaveBeenCalled();
    });
  });

  it('GET — 405', async () => {
    expect((await send(probe().deps, { files: FILES }, urlOf(), 'GET')).status).toBe(405);
  });

  it('приём упал — 500 tool-failed и строка журнала', async () => {
    const { deps, log } = probe(new Error('база недоступна'));
    const answer = await send(deps);
    expect(answer.status).toBe(500);
    expect(json(answer)).toMatchObject({ error: { code: 'tool-failed' } });
    expect(log).toHaveBeenCalledWith('extension-section-failed', {
      extension: 'test-ext',
      name: 'reviews',
      error: 'база недоступна',
    });
  });
});
