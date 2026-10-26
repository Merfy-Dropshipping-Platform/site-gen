import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { defineSection } from '../src/core/define';
import { files } from '../src/core/parts/files';
import { start, type StartedCore } from '../src/core/start';
import type { Ctx, El, Mode, SectionDef } from '../src/core/types';
import { entry, placeSection } from './core-support';
import { API_URL, SHOP_ID, addressOf, fakeGateway, storefrontConfig, type Answer } from './sdk-support';

// ctx.files (блок 12 «Секций и SDK», часть 12е, Р12е-2): выбор из поля, загрузка в три шага (шлюз → хранилище →
// шлюз), превью картинки — как extension-upload.ts theme-base. Расширение — test-ext, id передаёт секция.
const STORAGE = 'https://minio.dev.merfy.ru/ext-files';
const START = 'POST /store/extensions/test-ext/files';
const STORE = 'POST /ext-files';
const DONE = 'POST /store/extensions/test-ext/files/file-1/complete';
const TOKEN = 'token-12e';
const PHOTO = { extension: 'test-ext', kind: 'photo' } as const;
const started: Answer = {
  status: 201,
  body: { success: true, data: { fileId: 'file-1', upload: { url: STORAGE, fields: { key: 'k-1', policy: 'p-1' } } } },
};
const verdict = (data: Record<string, string>): Answer => ({
  status: 201,
  body: { success: true, data: { fileId: 'file-1', ...data } },
});
type FilesCtx = Ctx<Record<string, unknown>, 'files'>;
let core: StartedCore | undefined;

afterEach(() => {
  core?.stop();
  core = undefined;
  vi.unstubAllGlobals();
  localStorage.clear();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

function openPage(mode: Mode = 'live'): Promise<FilesCtx> {
  const config = storefrontConfig(mode);
  document.head.innerHTML = `<script type="application/json" id="merfy-config">${JSON.stringify(config)}</script>`;
  placeSection('shop:upload', 'upload-1', '<input type="file" data-ref="pick"><img data-ref="thumb" alt="" hidden>');
  return new Promise((resolve) => {
    const definition: SectionDef = defineSection({ mount: (_el, ctx) => resolve(ctx) });
    core = start({ parts: [files], sections: [entry('shop:upload', definition, { uses: ['files'] })] });
  });
}

function refOf(ctx: FilesCtx, name: string): El {
  const el = ctx.ref(name);
  if (el === null) throw new Error(`нет data-ref="${name}"`);
  return el;
}

// FileList в jsdom не создать — массив File тем же свойством поля.
function choose(list: readonly File[]): void {
  Object.defineProperty(document.querySelector('[data-ref="pick"]'), 'files', { value: list, configurable: true });
}
const fileOf = (name: string, bytes = 3, type = ''): File => new File([new Uint8Array(bytes)], name, { type });

async function keyOf(ctx: FilesCtx, file: File): Promise<string> {
  choose([file]);
  const key = ctx.files.chosen(refOf(ctx, 'pick'))[0]?.key ?? '';
  return await Promise.resolve(key);
}

describe('ctx.files', () => {
  it('chosen: ключ, имя, размер, тип по расширению имени, картинка ли; заморожен; не поле файла — пусто', async () => {
    const ctx = await openPage();
    choose([fileOf('kitchen.JPG'), fileOf('plan.heic', 5), fileOf('smeta.pdf', 4, 'application/pdf')]);
    const list = ctx.files.chosen(refOf(ctx, 'pick'));
    expect(list).toEqual([
      { key: 'f1', name: 'kitchen.JPG', size: 3, type: 'image/jpeg', image: true },
      { key: 'f2', name: 'plan.heic', size: 5, type: 'image/heic', image: false },
      { key: 'f3', name: 'smeta.pdf', size: 4, type: 'application/pdf', image: false },
    ]);
    expect(Object.isFrozen(list)).toBe(true);
    expect(ctx.files.chosen(refOf(ctx, 'thumb'))).toEqual([]);
  });

  it('превью конструктора: выбор пуст, загрузка — invalid без запросов', async () => {
    const gateway = fakeGateway();
    const ctx = await openPage('preview');
    choose([fileOf('kitchen.jpg')]);
    expect(ctx.files.chosen(refOf(ctx, 'pick'))).toEqual([]);
    expect(await ctx.files.upload({ key: 'f1', ...PHOTO }, { quiet: true })).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(gateway.calls).toEqual([]);
  });

  it('upload: три шага — шлюз с токеном, хранилище формой (поля, файл последним, без cookie и токена), шлюз; ready', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer(START, started);
    gateway.answer(STORE, { status: 201, body: {} });
    gateway.answer(DONE, verdict({ status: 'ready' }));
    const ctx = await openPage();
    const result = await ctx.files.upload({ key: await keyOf(ctx, fileOf('kitchen.jpg', 3, 'image/jpeg')), ...PHOTO });
    expect(result).toEqual({ ok: true, data: { status: 'ready', fileId: 'file-1' } });
    expect(gateway.keys()).toEqual([START, STORE, DONE]);
    expect(gateway.calls[0]?.body).toEqual({ kind: 'photo', name: 'kitchen.jpg', size: 3, mime: 'image/jpeg' });
    const [first, second, third] = vi.mocked(fetch).mock.calls;
    expect(addressOf(first?.[0] ?? '')).toBe(`${API_URL}/store/extensions/test-ext/files?store_id=${SHOP_ID}`);
    expect(new Headers(first?.[1]?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(addressOf(second?.[0] ?? '')).toBe(STORAGE);
    expect(second?.[1]?.credentials).toBe('omit');
    expect(new Headers(second?.[1]?.headers).get('authorization')).toBeNull();
    const form = second?.[1]?.body;
    expect(form instanceof FormData ? [...form.keys()] : null).toEqual(['key', 'policy', 'file']);
    expect(new Headers(third?.[1]?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it.each<[string, Answer[], string]>([
    ['шаг 1: too_large', [{ status: 400, body: { success: false, code: 'too_large' } }], 'size'],
    [
      'шаг 3: wrong_type',
      [started, { status: 201, body: {} }, verdict({ status: 'rejected', reason: 'wrong_type' })],
      'format',
    ],
  ])('отказ, %s — rejected', async (_name, answers, reason) => {
    const gateway = fakeGateway();
    [START, STORE, DONE].forEach((key, index) => {
      const one = answers[index];
      if (one !== undefined) gateway.answer(key, one);
    });
    const ctx = await openPage();
    const key = await keyOf(ctx, fileOf('kitchen.jpg'));
    expect(await ctx.files.upload({ key, ...PHOTO })).toEqual({ ok: true, data: { status: 'rejected', reason } });
    expect(gateway.keys()).toHaveLength(answers.length);
  });

  it('сбои: хранилище недоступно — network без шага 3 и без уведомления при quiet; 500 — server; чужой ключ — invalid', async () => {
    const gateway = fakeGateway();
    gateway.answer(START, started, { status: 500, body: { success: false, code: 'unavailable' } });
    gateway.answer(STORE, 'network');
    const shown: Event[] = [];
    document.addEventListener('merfy:notice:show', (event) => shown.push(event));
    const ctx = await openPage();
    const key = await keyOf(ctx, fileOf('kitchen.jpg'));
    const quiet = { quiet: true };
    expect(await ctx.files.upload({ key, ...PHOTO }, quiet)).toMatchObject({ ok: false, error: { code: 'network' } });
    expect(await ctx.files.upload({ key, ...PHOTO }, quiet)).toMatchObject({ ok: false, error: { code: 'server' } });
    expect(await ctx.files.upload({ key: 'f99', ...PHOTO }, quiet)).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(gateway.keys()).toEqual([START, STORE, START]);
    expect(shown).toEqual([]);
  });

  it('preview: картинка — blob: в src и показ; forget — ссылка отозвана, src убран, ключ забыт; не картинка — ничего', async () => {
    const create = vi.fn(() => 'blob:https://scarves.example/1');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true, writable: true });
    const ctx = await openPage();
    choose([fileOf('kitchen.jpg', 3, 'image/jpeg'), fileOf('smeta.pdf')]);
    const [image, doc] = ctx.files.chosen(refOf(ctx, 'pick'));
    const thumb = document.querySelector('img');
    ctx.files.preview(refOf(ctx, 'thumb'), image?.key ?? '');
    expect([thumb?.getAttribute('src'), thumb?.hidden]).toEqual(['blob:https://scarves.example/1', false]);
    ctx.files.forget(image?.key ?? '');
    expect(revoke).toHaveBeenCalledWith('blob:https://scarves.example/1');
    expect([thumb?.hasAttribute('src'), thumb?.hidden]).toEqual([false, true]);
    expect(await ctx.files.upload({ key: image?.key ?? '', ...PHOTO }, { quiet: true })).toMatchObject({ ok: false });
    ctx.files.preview(refOf(ctx, 'thumb'), doc?.key ?? '');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
