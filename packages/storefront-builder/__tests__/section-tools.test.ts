import {
  RoleTakenError,
  type AcceptResult,
  type PrepareResult,
  type SectionProblem,
  type SectionRow,
} from '@merfy/storefront-sections';
import { describe, expect, it, vi } from 'vitest';
import type { DrawAnswer } from '../src/draw';
import { sectionTool, sectionUploadsOpen, type SectionToolsDeps } from '../src/section-tools';

// Входы sites для инструментов секций (блок 14, 14.7): договор — plan-14b.md, «Договор».
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const E0 = '00000000-0000-4000-8000-0000000000e0';
const E1 = '00000000-0000-4000-8000-0000000000e1';
const MANIFEST = { sdk: 1, name: 'reviews', kind: 'section', title: 'Отзывы', settings: [] };
const FILES = { 'section.json': JSON.stringify(MANIFEST), 'template.astro': '<div></div>' };
const UNKNOWN: SectionProblem = {
  code: 'setting-name-unknown',
  file: 'section.json',
  line: 9,
  column: 13,
  message: 'поле «title»: имени нет в словаре; ближе всего — heading',
};

function row(id: string, draft: boolean, published: boolean): SectionRow {
  return {
    id,
    name: 'shop:reviews',
    kind: 'section',
    author: 'shop',
    owner: SHOP,
    release: null,
    sourceHash: `s-${id}`,
    contentHash: `c-${id}`,
    manifest: MANIFEST,
    template: '<div></div>',
    style: '',
    render: 'export default 1;',
    renderHash: `r-${id}`,
    script: null,
    scriptHash: null,
    warnings: [],
    draft,
    published,
    createdAt: id === E0 ? '2026-10-20T09:00:00.000Z' : '2026-10-21T09:00:00.000Z',
  };
}

function depsOf(over: Partial<SectionToolsDeps> = {}): SectionToolsDeps & { logged: string[] } {
  const logged: string[] = [];
  return {
    shop: (raw) => Promise.resolve(raw === SHOP ? SHOP : null),
    open: () => true,
    check: vi.fn((): Promise<PrepareResult> => Promise.resolve({ ok: false, problems: [UNKNOWN] })),
    accept: vi.fn((): Promise<AcceptResult> => Promise.resolve({ status: 'accepted', row: row(E1, true, false) })),
    source: (_shop, name) => Promise.resolve(name === 'shop:reviews' ? { id: E1, files: FILES } : null),
    history: (_shop, name) =>
      Promise.resolve(name === 'shop:reviews' ? [row(E0, false, true), row(E1, true, false)] : []),
    rollback: (_shop, _name, id) => Promise.resolve(id === E0 ? row(E0, true, true) : null),
    errors: () => Promise.resolve([]),
    log: (event) => {
      logged.push(event);
    },
    logged,
    ...over,
  };
}

const call = (deps: SectionToolsDeps, method: string, path: string, body = ''): Promise<DrawAnswer> =>
  sectionTool(deps, method, new URL(`http://builder${path}`), () => Promise.resolve(body));
const json = (answer: DrawAnswer): unknown => JSON.parse(answer.body);
const filesBody = (files: Record<string, string>): string => JSON.stringify({ files });
const DOC = 'errors.md#setting-name-unknown';

// expect.any возвращает any: через хелпер с типом unknown — без unsafe-assignment (RULES секций, §8, с 24.10).
const anyText = (): unknown => expect.any(String);

describe('проверить', () => {
  it('200 и ответ проверки с doc; AGENTS.md и CLAUDE.md в проверку не уходят; строка журнала', async () => {
    const deps = depsOf();
    const answer = await call(deps, 'POST', `/sections/check?shop=${SHOP}`, filesBody({ ...FILES, 'AGENTS.md': '#' }));
    expect(answer.status).toBe(200);
    expect(json(answer)).toEqual({
      ok: false,
      name: 'shop:reviews',
      problems: [{ ...UNKNOWN, doc: DOC }],
      warnings: [],
    });
    expect(deps.check).toHaveBeenCalledWith({ prefix: 'shop', files: FILES });
    expect(deps.logged).toEqual(['section-checked']);
  });
});

describe('сохранить', () => {
  it('записана: 200, status и id; способ сохранения — своя секция магазина из адреса', async () => {
    const deps = depsOf();
    const answer = await call(deps, 'POST', `/sections/save?shop=${SHOP}`, filesBody(FILES));
    expect(answer.status).toBe(200);
    expect(json(answer)).toEqual({
      ok: true,
      name: 'shop:reviews',
      problems: [],
      warnings: [],
      status: 'accepted',
      id: E1,
    });
    expect(deps.accept).toHaveBeenCalledWith({ author: 'shop', shopId: SHOP }, FILES);
  });

  it('отказ: 422 и проблемы с doc, ничего не записано', async () => {
    const accept = vi.fn((): Promise<AcceptResult> => Promise.resolve({ status: 'refused', problems: [UNKNOWN] }));
    const answer = await call(depsOf({ accept }), 'POST', `/sections/save?shop=${SHOP}`, filesBody(FILES));
    expect(answer.status).toBe(422);
    expect(json(answer)).toEqual({
      ok: false,
      name: 'shop:reviews',
      problems: [{ ...UNKNOWN, doc: DOC }],
      warnings: [],
    });
  });
});

describe('ошибки запроса', () => {
  it('песочница не закрыта — 503 uploads-closed у проверки и сохранения; файлы — как обычно', async () => {
    const deps = depsOf({ open: () => false });
    for (const path of ['/sections/check', '/sections/save']) {
      const answer = await call(deps, 'POST', `${path}?shop=${SHOP}`, filesBody(FILES));
      expect([answer.status, json(answer)]).toEqual([
        503,
        { ok: false, error: { code: 'uploads-closed', message: anyText() } },
      ]);
    }
    expect(deps.check).not.toHaveBeenCalled();
    expect((await call(deps, 'GET', `/sections/source?shop=${SHOP}&name=reviews`)).status).toBe(200);
  });

  it.each([
    ['не JSON', '{files'],
    ['files — массив', '{"files":[]}'],
    ['текст файла — не строка', '{"files":{"section.json":1}}'],
    ['лишний ключ', `{"files":{},"shopId":"${SHOP}"}`],
  ])('тело: %s — 400 body-invalid', async (_title, body) => {
    const answer = await call(depsOf(), 'POST', `/sections/check?shop=${SHOP}`, body);
    expect(answer.status).toBe(400);
    expect(json(answer)).toMatchObject({ ok: false, error: { code: 'body-invalid' } });
  });

  it('магазина нет или он не новой темы — 404 shop-not-found', async () => {
    const answer = await call(
      depsOf(),
      'POST',
      '/sections/check?shop=00000000-0000-4000-8000-000000000000',
      filesBody(FILES),
    );
    expect([answer.status, json(answer)]).toEqual([
      404,
      { ok: false, error: { code: 'shop-not-found', message: anyText() } },
    ]);
  });

  it('не тот метод — 405; сбой — 500 tool-failed и строка журнала', async () => {
    expect((await call(depsOf(), 'GET', `/sections/check?shop=${SHOP}`)).status).toBe(405);
    const deps = depsOf({ check: () => Promise.reject(new Error('процесс не запустился')) });
    const answer = await call(deps, 'POST', `/sections/check?shop=${SHOP}`, filesBody(FILES));
    expect(answer.status).toBe(500);
    expect(json(answer)).toMatchObject({ ok: false, error: { code: 'tool-failed' } });
    expect(deps.logged).toEqual(['section-tool-failed']);
  });
});

describe('файлы, правки, откат', () => {
  it('файлы текущей правки; имя не по правилу — 400; секции нет — 404', async () => {
    const deps = depsOf();
    expect(json(await call(deps, 'GET', `/sections/source?shop=${SHOP}&name=reviews`))).toEqual({
      name: 'shop:reviews',
      id: E1,
      files: FILES,
    });
    expect((await call(deps, 'GET', `/sections/source?shop=${SHOP}&name=shop:reviews`)).status).toBe(400);
    const missing = await call(deps, 'GET', `/sections/source?shop=${SHOP}&name=faq`);
    expect([missing.status, json(missing)]).toEqual([
      404,
      { ok: false, error: { code: 'section-not-found', message: anyText() } },
    ]);
  });

  it('правки — по времени, с флагами; секции нет — 404', async () => {
    expect(json(await call(depsOf(), 'GET', `/sections/history?shop=${SHOP}&name=reviews`))).toEqual({
      name: 'shop:reviews',
      edits: [
        { id: E0, createdAt: '2026-10-20T09:00:00.000Z', draft: false, published: true },
        { id: E1, createdAt: '2026-10-21T09:00:00.000Z', draft: true, published: false },
      ],
    });
    expect((await call(depsOf(), 'GET', `/sections/history?shop=${SHOP}&name=faq`)).status).toBe(404);
  });

  it('откат: прежняя правка — текущая; чужой id — 404; тело не { id } — 400', async () => {
    const ok = await call(depsOf(), 'POST', `/sections/rollback?shop=${SHOP}&name=reviews`, JSON.stringify({ id: E0 }));
    expect(json(ok)).toEqual({ name: 'shop:reviews', id: E0, draft: true, published: true });
    const missing = await call(
      depsOf(),
      'POST',
      `/sections/rollback?shop=${SHOP}&name=reviews`,
      JSON.stringify({ id: E1 }),
    );
    expect(json(missing)).toMatchObject({ ok: false, error: { code: 'edit-not-found' } });
    expect((await call(depsOf(), 'POST', `/sections/rollback?shop=${SHOP}&name=reviews`, '{"id":"e0"}')).status).toBe(
      400,
    );
  });
});

describe('отчёт песочницы', () => {
  const closed = {
    node: 'v26.12.0',
    env: 0,
    net: 'closed',
    child: 'closed',
    worker: 'closed',
    write: 'closed',
    read: 'closed',
    inspector: 'closed',
    wasi: 'closed',
    neighbour: 'closed',
    user: 'separate',
    startMs: 120,
  } as const;

  it('загрузка включена только при закрытом всём', () => {
    expect(sectionUploadsOpen(closed)).toBe(true);
    expect(sectionUploadsOpen({ ...closed, net: 'open' })).toBe(false);
    expect(sectionUploadsOpen({ ...closed, env: 1 })).toBe(false);
    expect(sectionUploadsOpen({ ...closed, neighbour: 'missing' })).toBe(false);
    expect(sectionUploadsOpen({ ...closed, user: 'same' })).toBe(false);
    expect(sectionUploadsOpen(null)).toBe(false);
  });
});

// Блок 12 «Секций и SDK», часть 12в: ошибки правки из браузеров — в «правках секции»; откат к правке, чья роль занята
// другой секцией магазина, — 409 role-taken.
describe('правки с ошибками и откат с занятой ролью', () => {
  const H0 = `sha256:${'a'.repeat(64)}`;
  const H1 = `sha256:${'b'.repeat(64)}`;
  const withScript = (id: string, draft: boolean, published: boolean, scriptHash: string): SectionRow => ({
    ...row(id, draft, published),
    script: 'export default {};',
    scriptHash,
  });
  const ERROR = { stage: 'runtime', message: 'cart is not defined', count: 12, lastAt: '2026-10-24T09:14:00.000Z' };

  it('у правки с ошибками — errors её скрипта; у правки без ошибок ключа нет', async () => {
    const deps = depsOf({
      history: () => Promise.resolve([withScript(E0, true, true, H0), withScript(E1, false, false, H1)]),
      errors: () => Promise.resolve([{ scriptHash: H1, ...ERROR }]),
    });
    expect(json(await call(deps, 'GET', `/sections/history?shop=${SHOP}&name=reviews`))).toEqual({
      name: 'shop:reviews',
      edits: [
        { id: E0, createdAt: '2026-10-20T09:00:00.000Z', draft: true, published: true },
        { id: E1, createdAt: '2026-10-21T09:00:00.000Z', draft: false, published: false, errors: [ERROR] },
      ],
    });
  });

  it('роль правки занята другой секцией — 409 role-taken с ролью и именем секции', async () => {
    const deps = depsOf({ rollback: () => Promise.reject(new RoleTakenError('cart-drawer', 'shop:my-cart-drawer')) });
    const answer = await call(deps, 'POST', `/sections/rollback?shop=${SHOP}&name=reviews`, JSON.stringify({ id: E0 }));
    expect([answer.status, json(answer)]).toEqual([
      409,
      {
        ok: false,
        error: {
          code: 'role-taken',
          message:
            'роль cart-drawer у этой правки занята секцией shop:my-cart-drawer: сначала измени shop:my-cart-drawer или сними с неё роль',
        },
      },
    ]);
  });

  it('другой сбой отката — 500 tool-failed, как в 14б', async () => {
    const deps = depsOf({ rollback: () => Promise.reject(new Error('база недоступна')) });
    const answer = await call(deps, 'POST', `/sections/rollback?shop=${SHOP}&name=reviews`, JSON.stringify({ id: E0 }));
    expect([answer.status, json(answer)]).toMatchObject([500, { ok: false, error: { code: 'tool-failed' } }]);
  });
});
