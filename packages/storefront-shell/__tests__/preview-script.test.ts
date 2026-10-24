import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_BUNDLE_TAG_ID,
  PREVIEW_REPLACE_EVENT,
  PREVIEW_UPDATE_EVENT,
  PREVIEW_UPDATED_EVENT,
  REPLACE_LIMIT,
  type PreviewReplaceDetail,
  type SectionUpdated,
} from '../src/core/preview-protocol';
import { BUNDLE_FAILED_TEXT, LIMIT_TEXT, startPreview, type PreviewEnv } from '../src/preview/preview';

// Скрипт превью (блок 5 «Секций и SDK», часть 5г; design.md блока 5, раздел 3.11): бандл из JSON-тега, очередь правок,
// загрузка кода, итог — конструктору (postMessage) и странице (merfy:preview:updated). Ядро — подставное: отменяет
// merfy:preview:replace и отвечает, как watchPreviewReplace.
const HASH = (char: string): string => char.repeat(64);
const SECTION = (id: string): string =>
  `<merfy-section data-section="shop:scarf" data-section-id="${id}"><p>${id}</p></merfy-section>`;

let stop: () => void = () => undefined;
const cleanups: Array<() => void> = [];

afterEach(() => {
  stop();
  stop = () => undefined;
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

interface Waiting {
  readonly resolve: (value: unknown) => void;
}

// importCode: «сломан» — ошибка разбора, «длинно» — ошибка на 3000 знаков, «ждать» — обещание, которое решает тест;
// остальное — модуль с default { code }.
function fakeEnv() {
  const imported: string[] = [];
  const waiting: Waiting[] = [];
  const reload = vi.fn();
  const env: PreviewEnv = {
    win: window,
    importCode: (code) => {
      imported.push(code);
      if (code === 'сломан') return Promise.reject(new SyntaxError('Unexpected token'));
      if (code === 'длинно') return Promise.reject(new Error('я'.repeat(3000)));
      if (code === 'ждать') return new Promise((resolve) => void waiting.push({ resolve }));
      return Promise.resolve({ default: { code } });
    },
    reload,
  };
  return { env, imported, waiting, reload };
}

const isReplace = (value: unknown): value is PreviewReplaceDetail =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'reply') === 'function';

// Подставное ядро: script null — fresh; код загрузился — kept-state с JSON его default; не загрузился — reloaded.
function fakeCore(seen: PreviewReplaceDetail[]): void {
  const listener = (event: Event): void => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;
    if (!isReplace(detail)) return;
    event.preventDefault();
    seen.push(detail);
    if (detail.script === null) return detail.reply('fresh', '');
    void detail.load().then(
      (definition) => detail.reply('kept-state', JSON.stringify(definition)),
      (error: unknown) => detail.reply('reloaded', error instanceof Error ? error.message : String(error)),
    );
  };
  document.addEventListener(PREVIEW_REPLACE_EVENT, listener);
  cleanups.push(() => document.removeEventListener(PREVIEW_REPLACE_EVENT, listener));
}

const isUpdated = (value: unknown): value is SectionUpdated =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'outcome') === 'string';

function watchUpdated(): SectionUpdated[] {
  const list: SectionUpdated[] = [];
  const listener = (event: Event): void => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;
    if (isUpdated(detail)) list.push(detail);
  };
  document.addEventListener(PREVIEW_UPDATED_EVENT, listener);
  cleanups.push(() => document.removeEventListener(PREVIEW_UPDATED_EVENT, listener));
  return list;
}

// Секции страницы и, если задан, JSON-тег бандла.
function page(ids: readonly string[], bundle?: string): void {
  document.body.innerHTML = ids.map(SECTION).join('');
  if (bundle === undefined) return;
  const tag = document.createElement('script');
  tag.type = 'application/json';
  tag.id = PREVIEW_BUNDLE_TAG_ID;
  tag.textContent = bundle;
  document.body.append(tag);
}

// Правка от скрипта секций превью: true — скрипт превью отменил событие (взял правку себе).
function update(id: string, detail: unknown): boolean {
  const node = document.querySelector(`merfy-section[data-section-id="${id}"]`);
  if (node === null) throw new Error(`нет секции ${id}`);
  return !node.dispatchEvent(new CustomEvent(PREVIEW_UPDATE_EVENT, { bubbles: true, cancelable: true, detail }));
}

const edit = (id: string, char: string, code = 'export default {}') => ({
  html: SECTION(id),
  codeOnly: false,
  script: { hash: HASH(char), code, uses: ['cart'] },
});

const posted = () => vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('скрипт превью: бандл страницы', () => {
  it('бандл — строка JSON-тега, загружается один раз; правки ждут его загрузки', async () => {
    const { env, imported, waiting } = fakeEnv();
    const seen: PreviewReplaceDetail[] = [];
    fakeCore(seen);
    const updated = watchUpdated();
    posted();
    page(['s-1'], JSON.stringify('ждать'));
    stop = startPreview(env);
    expect(update('s-1', edit('s-1', 'a'))).toBe(true);
    await settle();
    expect(imported).toEqual(['ждать']);
    expect(seen).toEqual([]);
    waiting[0]?.resolve({});
    await vi.waitFor(() => expect(updated).toHaveLength(1));
    expect(imported).toEqual(['ждать', 'export default {}']);
    expect(seen).toHaveLength(1);
  });

  it('нет JSON-тега и нет ядра — правка сразу, скрипт превью сам ставит новый HTML: fresh', async () => {
    const { env, imported } = fakeEnv();
    const updated = watchUpdated();
    posted();
    page(['s-1']);
    stop = startPreview(env);
    const before = document.querySelector('merfy-section');
    const html = '<merfy-section data-section="shop:scarf" data-section-id="s-1"><p>новый</p></merfy-section>';
    expect(update('s-1', { html, codeOnly: false, script: null })).toBe(true);
    await vi.waitFor(() => expect(updated).toEqual([{ id: 's-1', outcome: 'fresh', message: '' }]));
    expect(document.querySelector('merfy-section')).not.toBe(before);
    expect(document.querySelector('merfy-section p')?.textContent).toBe('новый');
    expect(imported).toEqual([]);
  });

  it('нет ядра и codeOnly — HTML на месте: kept-state', async () => {
    const { env } = fakeEnv();
    const updated = watchUpdated();
    posted();
    page(['s-1']);
    stop = startPreview(env);
    const before = document.querySelector('merfy-section');
    expect(update('s-1', { ...edit('s-1', 'a'), codeOnly: true })).toBe(true);
    await vi.waitFor(() => expect(updated).toEqual([{ id: 's-1', outcome: 'kept-state', message: '' }]));
    expect(document.querySelector('merfy-section')).toBe(before);
  });

  it('тег не строка, бандл не загрузился — render-error конструктору (до 2000 знаков) и строка в консоли', async () => {
    const { env } = fakeEnv();
    const post = posted();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    page(['s-1'], JSON.stringify({ code: 'не строка' }));
    stop = startPreview(env);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'render-error' }), '*');
    stop();
    page(['s-1'], JSON.stringify('сломан'));
    stop = startPreview(env);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenLastCalledWith(
      { type: 'render-error', message: `${BUNDLE_FAILED_TEXT}: Unexpected token` },
      '*',
    );
    stop();
    page(['s-1'], JSON.stringify('длинно'));
    stop = startPreview(env);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    const last: unknown = post.mock.calls.at(-1)?.[0];
    const text: unknown = typeof last === 'object' && last !== null ? Reflect.get(last, 'message') : null;
    expect(typeof text === 'string' ? text.length : 0).toBe(2000);
    expect(consoleError).toHaveBeenCalledTimes(3);
  });
});

describe('скрипт превью: правки', () => {
  it('ядру — HTML, codeOnly, hash и uses без текста кода; load отдаёт export default; итог — конструктору и странице', async () => {
    const { env } = fakeEnv();
    const seen: PreviewReplaceDetail[] = [];
    fakeCore(seen);
    const updated = watchUpdated();
    const post = posted();
    page(['s-1']);
    stop = startPreview(env);
    expect(update('s-1', edit('s-1', 'a', 'код v2'))).toBe(true);
    await vi.waitFor(() => expect(updated).toHaveLength(1));
    expect(seen[0]?.html).toBe(SECTION('s-1'));
    expect(seen[0]?.codeOnly).toBe(false);
    expect(seen[0]?.script).toEqual({ hash: HASH('a'), uses: ['cart'] });
    const result = { id: 's-1', outcome: 'kept-state', message: JSON.stringify({ code: 'код v2' }) };
    expect(updated).toEqual([result]);
    expect(post).toHaveBeenCalledWith({ type: 'section-updated', ...result }, '*');
  });

  it('очередь по одной правке: старая правка той же секции — superseded, остальные — по порядку', async () => {
    const { env, imported } = fakeEnv();
    const seen: PreviewReplaceDetail[] = [];
    fakeCore(seen);
    const updated = watchUpdated();
    posted();
    page(['s-1', 's-2']);
    stop = startPreview(env);
    update('s-1', edit('s-1', 'a', 'первая'));
    update('s-1', edit('s-1', 'b', 'вторая'));
    update('s-2', edit('s-2', 'c', 'третья'));
    await vi.waitFor(() => expect(updated).toHaveLength(3));
    expect(updated.map(({ id, outcome }) => `${id} ${outcome}`)).toEqual([
      's-1 superseded',
      's-1 kept-state',
      's-2 kept-state',
    ]);
    expect(seen.map((detail) => detail.script?.hash)).toEqual([HASH('b'), HASH('c')]);
    expect(imported).toEqual(['вторая', 'третья']);
  });

  it('секции нет на странице, когда до неё дошла очередь, — absent', async () => {
    const { env, waiting } = fakeEnv();
    fakeCore([]);
    const updated = watchUpdated();
    posted();
    page(['s-1'], JSON.stringify('ждать'));
    stop = startPreview(env);
    update('s-1', edit('s-1', 'a'));
    document.querySelector('merfy-section')?.remove();
    await settle();
    waiting[0]?.resolve({});
    await vi.waitFor(() => expect(updated).toEqual([{ id: 's-1', outcome: 'absent', message: '' }]));
  });

  it('данные правки не той формы — событие не отменено, ответа нет', async () => {
    const { env } = fakeEnv();
    const updated = watchUpdated();
    posted();
    page(['s-1']);
    stop = startPreview(env);
    const wrong: unknown[] = [
      null,
      { html: 1, codeOnly: false, script: null },
      { html: '', codeOnly: 'да', script: null },
      { ...edit('s-1', 'a'), script: { hash: 'короткий', code: '', uses: [] } },
      { ...edit('s-1', 'a'), script: { hash: HASH('a'), code: 1, uses: [] } },
      { ...edit('s-1', 'a'), script: { hash: HASH('a'), code: '', uses: [1] } },
    ];
    for (const detail of wrong) expect(update('s-1', detail)).toBe(false);
    await settle();
    expect(updated).toEqual([]);
  });

  it('после stop правки не принимаются', () => {
    const { env } = fakeEnv();
    page(['s-1']);
    stop = startPreview(env);
    stop();
    expect(update('s-1', edit('s-1', 'a'))).toBe(false);
  });
});

describe('скрипт превью: загрузка кода и перезагрузка', () => {
  it('код не загрузился — reloaded с текстом ошибки и одна перезагрузка', async () => {
    const { env, reload } = fakeEnv();
    fakeCore([]);
    const updated = watchUpdated();
    posted();
    page(['s-1', 's-2']);
    stop = startPreview(env);
    update('s-1', edit('s-1', 'a', 'сломан'));
    update('s-2', edit('s-2', 'b', 'сломан'));
    await vi.waitFor(() => expect(updated).toHaveLength(2));
    expect(updated[0]).toEqual({ id: 's-1', outcome: 'reloaded', message: 'Unexpected token' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('двадцатая загрузка кода — reloaded без загрузки, перезагрузка один раз', async () => {
    const { env, imported, reload } = fakeEnv();
    fakeCore([]);
    const updated = watchUpdated();
    posted();
    const ids = Array.from({ length: REPLACE_LIMIT + 1 }, (_, n) => `s-${n + 1}`);
    page(ids);
    stop = startPreview(env);
    ids.forEach((id, n) => update(id, edit(id, 'a', `код ${n + 1}`)));
    await vi.waitFor(() => expect(updated).toHaveLength(REPLACE_LIMIT + 1));
    expect(imported).toHaveLength(REPLACE_LIMIT - 1);
    expect(updated.map(({ outcome }) => outcome)).toEqual([
      ...Array<string>(REPLACE_LIMIT - 1).fill('kept-state'),
      'reloaded',
      'reloaded',
    ]);
    expect(updated[REPLACE_LIMIT - 1]?.message).toBe(LIMIT_TEXT);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
