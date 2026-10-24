import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import {
  PREVIEW_REPLACE_EVENT,
  REPLACE_TEXT,
  type PreviewReplaceDetail,
  type ReplaceOutcome,
} from '../src/core/preview-protocol';
import { watchPreviewReplace } from '../src/core/replace';
import { start, type StartedCore } from '../src/core/start';
import type { Ctx, SdkPart, SectionDef } from '../src/core/types';
import { configTag, entry, hash, inputTag, placeSection, tick, watchFailures } from './core-support';

// Замена экземпляра в превью (блок 5 «Секций и SDK», часть 5г; design.md блока 5, раздел 3.11): тот же <merfy-section>,
// новый HTML, копия ctx.state, новый код по hash, повтор без состояния, сбой. Только в режиме превью и только у бандла,
// который передал start({ preview: watchPreviewReplace }).
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

beforeEach(() => {
  failures = watchFailures();
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  vi.useRealTimers();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const V1 = hash('a'); // hash строки списка бандла по умолчанию (entry в core-support)
const V2 = hash('b');
type Reply = { readonly outcome: ReplaceOutcome; readonly message: string };

// Содержимое «Подбора шарфа»: заголовок, две кнопки пальто, строка запусков, тег входных данных.
const bodyOf = (title: string): string =>
  `<h2 data-ref="title">${title}</h2>` +
  '<button type="button" data-ref="coat" data-coat="grey" data-action="pick">Серое</button>' +
  '<button type="button" data-ref="coat" data-coat="black" data-action="pick">Чёрное</button>' +
  '<p data-ref="clock"></p>' +
  inputTag({ settings: { title }, blocks: [], data: {} });

const sectionHtml = (id: string, title: string): string =>
  `<merfy-section data-section="shop:scarf" data-section-id="${id}">${bodyOf(title)}</merfy-section>`;

const mountsOf = (ctx: Ctx): number => (typeof ctx.state.mounts === 'number' ? ctx.state.mounts : 0);

function show(ctx: Ctx, version: string): void {
  const coat = typeof ctx.state.coat === 'string' ? ctx.state.coat : 'нет';
  ctx.ref('clock')?.text(`${version} · запусков: ${mountsOf(ctx)} · ${coat}`);
}

// «Подбор шарфа» версии version: строка запусков, выбор пальто; таймер, page:view и unmount — в журнал.
function scarf(version: string, log: string[]): SectionDef {
  return defineSection({
    mount(_el, ctx) {
      ctx.state.mounts = mountsOf(ctx) + 1;
      show(ctx, version);
      ctx.every(1000, () => void log.push(`${version} тик ${ctx.id}`));
      ctx.listen('merfy:page:view', () => void log.push(`${version} view ${ctx.id}`));
    },
    actions: {
      pick(target, ctx) {
        ctx.state.coat = target.attr('data-coat');
        show(ctx, version);
      },
    },
    unmount: (_el, ctx) => void log.push(`${version} unmount ${ctx.id}`),
  });
}

interface ReplaceArgs {
  readonly html: string;
  readonly script: PreviewReplaceDetail['script'];
  readonly codeOnly?: boolean;
  readonly load?: () => Promise<unknown>;
}

// Событие замены — как его отправляет скрипт превью; ответ ядра или 'not-handled', если событие никто не отменил.
function replace(target: Element, args: ReplaceArgs): Promise<Reply | 'not-handled'> {
  return new Promise((resolve) => {
    const detail: PreviewReplaceDetail = {
      html: args.html,
      script: args.script,
      codeOnly: args.codeOnly ?? false,
      load: args.load ?? (() => Promise.reject(new Error('код не загружали'))),
      reply: (outcome, message) => resolve({ outcome, message }),
    };
    if (target.dispatchEvent(new CustomEvent(PREVIEW_REPLACE_EVENT, { bubbles: true, cancelable: true, detail })))
      resolve('not-handled');
  });
}

function sectionOf(id: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`merfy-section[data-section-id="${id}"]`);
  if (node === null) throw new Error(`нет секции ${id}`);
  return node;
}

const clockOf = (id: string): string | null | undefined =>
  sectionOf(id).querySelector('[data-ref="clock"]')?.textContent;
const titleOf = (id: string): string | null | undefined =>
  sectionOf(id).querySelector('[data-ref="title"]')?.textContent;
const pick = (id: string, coat: string): void =>
  sectionOf(id).querySelector<HTMLElement>(`[data-coat="${coat}"]`)?.click();
const lines = (log: readonly string[], word: string): string[] => log.filter((line) => line.includes(word));

// Превью с «Подбором шарфа» v1 в экземплярах ids.
function openPreview(
  log: string[],
  ids: readonly string[] = ['scarf-1'],
  parts: SdkPart<string, unknown>[] = [],
): void {
  document.head.innerHTML = configTag('preview');
  ids.forEach((id) => placeSection('shop:scarf', id, bodyOf('Подберите шарф')));
  core = start({ parts, sections: [entry('shop:scarf', scarf('v1', log))], preview: watchPreviewReplace });
}

describe('замена в превью: где работает', () => {
  it('опубликованный сайт: слушателя нет — событие не отменено', async () => {
    document.head.innerHTML = configTag('live');
    placeSection('shop:scarf', 'scarf-1', bodyOf('Подберите шарф'));
    core = start({ parts: [], sections: [entry('shop:scarf', scarf('v1', []))], preview: watchPreviewReplace });
    const args = { html: sectionHtml('scarf-1', 'Новый'), script: { hash: V1, uses: [] } };
    expect(await replace(sectionOf('scarf-1'), args)).toBe('not-handled');
  });

  it('бандл без preview: слушателя нет — событие не отменено', async () => {
    document.head.innerHTML = configTag('preview');
    placeSection('shop:scarf', 'scarf-1', bodyOf('Подберите шарф'));
    core = start({ parts: [], sections: [entry('shop:scarf', scarf('v1', []))] });
    const args = { html: sectionHtml('scarf-1', 'Новый'), script: { hash: V1, uses: [] } };
    expect(await replace(sectionOf('scarf-1'), args)).toBe('not-handled');
  });

  it('данные события не той формы и цель не секция — событие не отменено', async () => {
    openPreview([]);
    const event = new CustomEvent(PREVIEW_REPLACE_EVENT, { bubbles: true, cancelable: true, detail: { html: 1 } });
    expect(sectionOf('scarf-1').dispatchEvent(event)).toBe(true);
    const args = { html: sectionHtml('scarf-1', 'Новый'), script: { hash: V1, uses: [] } };
    expect(await replace(document.body, args)).toBe('not-handled');
    expect(await replace(sectionOf('scarf-1'), { ...args, script: { hash: 'короткий', uses: [] } })).toBe(
      'not-handled',
    );
  });
});

describe('замена в превью: правка поля и новый код', () => {
  it('правка поля, тот же код: тот же узел, новый HTML, ctx.state перенесён, старый таймер снят', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    openPreview(log);
    const element = sectionOf('scarf-1');
    pick('scarf-1', 'grey');
    expect(clockOf('scarf-1')).toBe('v1 · запусков: 1 · grey');
    const reply = await replace(element, {
      html: sectionHtml('scarf-1', 'Новый заголовок'),
      script: { hash: V1, uses: [] },
    });
    expect(reply).toEqual({ outcome: 'kept-state', message: '' });
    expect(sectionOf('scarf-1')).toBe(element);
    expect(titleOf('scarf-1')).toBe('Новый заголовок');
    expect(clockOf('scarf-1')).toBe('v1 · запусков: 2 · grey');
    expect(element.getAttribute('data-merfy-state')).toBe('mounted');
    expect(lines(log, 'unmount')).toEqual(['v1 unmount scarf-1']);
    vi.advanceTimersByTime(1000);
    expect(lines(log, 'тик')).toEqual(['v1 тик scarf-1']);
    pick('scarf-1', 'black');
    expect(clockOf('scarf-1')).toBe('v1 · запусков: 2 · black');
  });

  it('новый hash: код загружается один раз, его получают и следующие экземпляры', async () => {
    const log: string[] = [];
    openPreview(log, ['scarf-1', 'scarf-2']);
    const load = vi.fn(() => Promise.resolve(scarf('v2', log)));
    const v2 = { script: { hash: V2, uses: [] }, load };
    expect(await replace(sectionOf('scarf-1'), { html: sectionHtml('scarf-1', 'Подберите шарф'), ...v2 })).toEqual({
      outcome: 'kept-state',
      message: '',
    });
    expect(clockOf('scarf-1')).toBe('v2 · запусков: 2 · нет');
    expect(clockOf('scarf-2')).toBe('v1 · запусков: 1 · нет');
    expect(await replace(sectionOf('scarf-2'), { html: sectionHtml('scarf-2', 'Подберите шарф'), ...v2 })).toEqual({
      outcome: 'kept-state',
      message: '',
    });
    expect(clockOf('scarf-2')).toBe('v2 · запусков: 2 · нет');
    placeSection('shop:scarf', 'scarf-3', bodyOf('Подберите шарф'));
    expect(clockOf('scarf-3')).toBe('v2 · запусков: 1 · нет');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('page:ready и page:view — только новому экземпляру', async () => {
    const log: string[] = [];
    openPreview(log, ['scarf-1', 'scarf-2']);
    expect(log).toEqual(['v1 view scarf-1', 'v1 view scarf-2']);
    log.length = 0;
    await replace(sectionOf('scarf-1'), { html: sectionHtml('scarf-1', 'Новый'), script: { hash: V1, uses: [] } });
    expect(log).toEqual(['v1 unmount scarf-1', 'v1 view scarf-1']);
  });

  it('codeOnly: тот же код — kept-state без перезапуска; новый код — перезапуск с HTML ответа', async () => {
    const log: string[] = [];
    openPreview(log);
    pick('scarf-1', 'grey');
    const same = { html: sectionHtml('scarf-1', 'Не применится'), script: { hash: V1, uses: [] }, codeOnly: true };
    expect(await replace(sectionOf('scarf-1'), same)).toEqual({ outcome: 'kept-state', message: '' });
    expect(lines(log, 'unmount')).toEqual([]);
    expect(titleOf('scarf-1')).toBe('Подберите шарф');
    const fresh = { html: sectionHtml('scarf-1', 'Из ответа'), script: { hash: V2, uses: [] }, codeOnly: true };
    const reply = await replace(sectionOf('scarf-1'), { ...fresh, load: () => Promise.resolve(scarf('v2', log)) });
    expect(reply).toEqual({ outcome: 'kept-state', message: '' });
    expect(clockOf('scarf-1')).toBe('v2 · запусков: 2 · grey');
    expect(titleOf('scarf-1')).toBe('Из ответа');
  });

  it('uses из ответа: модуль корзины у нового кода; модуля нет на странице — сбой part-unknown', async () => {
    const seen: unknown[] = [];
    const cartPart: SdkPart<'cart', { marker: string }> = { name: 'cart', create: () => ({ marker: 'корзина' }) };
    openPreview([], ['scarf-1'], [cartPart]);
    const withCart = defineSection({ mount: (_el, ctx) => void seen.push(ctx.cart) });
    const html = sectionHtml('scarf-1', 'Подберите шарф');
    const load = () => Promise.resolve(withCart);
    expect(await replace(sectionOf('scarf-1'), { html, script: { hash: V2, uses: ['cart'] }, load })).toEqual({
      outcome: 'kept-state',
      message: '',
    });
    expect(seen).toEqual([{ marker: 'корзина' }]);
    expect(
      await replace(sectionOf('scarf-1'), { html, script: { hash: hash('c'), uses: ['favorites'] }, load }),
    ).toEqual({
      outcome: 'failed',
      message: 'части favorites на странице нет',
    });
  });

  it('код у секции убрали: unmount, экземпляра нет, следующие экземпляры — без кода', async () => {
    const log: string[] = [];
    openPreview(log);
    expect(await replace(sectionOf('scarf-1'), { html: sectionHtml('scarf-1', 'Без кода'), script: null })).toEqual({
      outcome: 'fresh',
      message: '',
    });
    expect(lines(log, 'unmount')).toEqual(['v1 unmount scarf-1']);
    expect(sectionOf('scarf-1').hasAttribute('data-merfy-state')).toBe(false);
    expect(titleOf('scarf-1')).toBe('Без кода');
    placeSection('shop:scarf', 'scarf-2', bodyOf('Подберите шарф'));
    expect(clockOf('scarf-2')).toBe('');
  });
});

describe('замена в превью: повтор, сбой, отказ', () => {
  it('новый код не принял старое состояние — ещё раз без него и с чистым HTML: fresh', async () => {
    openPreview([]);
    pick('scarf-1', 'grey');
    const picky = defineSection({
      mount(_el, ctx) {
        if (ctx.state.mounts !== undefined) throw new Error('старое состояние не подходит');
        ctx.state.mounts = 1;
        show(ctx, 'picky');
      },
    });
    const html = sectionHtml('scarf-1', 'Подберите шарф');
    const reply = await replace(sectionOf('scarf-1'), {
      html,
      script: { hash: V2, uses: [] },
      load: () => Promise.resolve(picky),
    });
    expect(reply).toEqual({ outcome: 'fresh', message: '' });
    expect(clockOf('scarf-1')).toBe('picky · запусков: 1 · нет');
    expect(sectionOf('scarf-1').getAttribute('data-merfy-state')).toBe('mounted');
    expect(sectionOf('scarf-1').querySelector('[data-coat="grey"]')?.hasAttribute('aria-disabled')).toBe(false);
    expect(failures.details.map(({ message }) => message)).toEqual(['старое состояние не подходит']);
  });

  it('сломанный код: обе попытки — ошибка; failed с текстом ошибки, секция в сбое', async () => {
    openPreview([]);
    pick('scarf-1', 'grey');
    const broken = defineSection({
      mount: () => {
        throw new Error('нет шарфов');
      },
    });
    const reply = await replace(sectionOf('scarf-1'), {
      html: sectionHtml('scarf-1', 'Подберите шарф'),
      script: { hash: V2, uses: [] },
      load: () => Promise.resolve(broken),
    });
    expect(reply).toEqual({ outcome: 'failed', message: 'нет шарфов' });
    expect(sectionOf('scarf-1').getAttribute('data-merfy-state')).toBe('failed');
    expect(failures.details.map(({ stage, message }) => `${stage}: ${message}`)).toEqual([
      'mount: нет шарфов',
      'mount: нет шарфов',
    ]);
  });

  it('асинхронный mount: ответ — когда обещание выполнилось; отклонённое — как ошибка', async () => {
    openPreview([]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = defineSection({
      async mount(_el, ctx) {
        await gate;
        ctx.state.mounts = mountsOf(ctx) + 1;
        show(ctx, 'slow');
      },
    });
    const html = sectionHtml('scarf-1', 'Подберите шарф');
    const replies: Array<Reply | 'not-handled'> = [];
    const pending = replace(sectionOf('scarf-1'), {
      html,
      script: { hash: V2, uses: [] },
      load: () => Promise.resolve(slow),
    }).then((reply) => void replies.push(reply));
    await tick();
    expect(replies).toEqual([]);
    release();
    await pending;
    expect(replies).toEqual([{ outcome: 'kept-state', message: '' }]);
    expect(clockOf('scarf-1')).toBe('slow · запусков: 2 · нет');
    const late = defineSection({
      async mount() {
        await Promise.resolve();
        throw new Error('ошибка после await');
      },
    });
    const reply = await replace(sectionOf('scarf-1'), {
      html,
      script: { hash: hash('c'), uses: [] },
      load: () => Promise.resolve(late),
    });
    expect(reply).toEqual({ outcome: 'failed', message: 'ошибка после await' });
  });

  it('код не загрузился — reloaded с текстом ошибки; HTML и экземпляр прежние', async () => {
    const log: string[] = [];
    openPreview(log);
    pick('scarf-1', 'grey');
    const reply = await replace(sectionOf('scarf-1'), {
      html: sectionHtml('scarf-1', 'Новый'),
      script: { hash: V2, uses: [] },
      load: () => Promise.reject(new SyntaxError('Unexpected token')),
    });
    expect(reply).toEqual({ outcome: 'reloaded', message: 'Unexpected token' });
    expect(clockOf('scarf-1')).toBe('v1 · запусков: 1 · grey');
    expect(titleOf('scarf-1')).toBe('Подберите шарф');
    expect(lines(log, 'unmount')).toEqual([]);
  });

  it('модуль не отдал определение — failed; hash не запомнен, следующая замена загружает код снова', async () => {
    const log: string[] = [];
    openPreview(log);
    const load = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(42)
      .mockResolvedValueOnce({ mount: 'не функция' })
      .mockResolvedValueOnce(scarf('v2', log));
    const args = { html: sectionHtml('scarf-1', 'Подберите шарф'), script: { hash: V2, uses: [] }, load };
    const notDefinition = { outcome: 'failed', message: REPLACE_TEXT.notDefinition };
    expect(await replace(sectionOf('scarf-1'), args)).toEqual(notDefinition);
    expect(await replace(sectionOf('scarf-1'), args)).toEqual(notDefinition);
    expect(await replace(sectionOf('scarf-1'), args)).toEqual({ outcome: 'kept-state', message: '' });
    expect(load).toHaveBeenCalledTimes(3);
    expect(clockOf('scarf-1')).toBe('v2 · запусков: 2 · нет');
  });

  it('HTML ответа — не этот экземпляр или не одна секция: failed, на странице ничего не поменялось', async () => {
    const log: string[] = [];
    openPreview(log);
    const wrong = [
      sectionHtml('other-1', 'Чужая'),
      sectionHtml('scarf-1', 'Две') + sectionHtml('scarf-1', 'секции'),
      '<div data-section-id="scarf-1">не секция</div>',
    ];
    for (const html of wrong) {
      expect(await replace(sectionOf('scarf-1'), { html, script: { hash: V1, uses: [] } })).toEqual({
        outcome: 'failed',
        message: REPLACE_TEXT.wrongHtml,
      });
    }
    expect(clockOf('scarf-1')).toBe('v1 · запусков: 1 · нет');
    expect(lines(log, 'unmount')).toEqual([]);
  });

  it('ctx.state не переводится в JSON — запуск без него: fresh', async () => {
    document.head.innerHTML = configTag('preview');
    const body = `<p data-ref="clock"></p>${inputTag({ settings: {}, blocks: [], data: {} })}`;
    placeSection('shop:loop', 'loop-1', body);
    const looped = defineSection({
      mount(_el, ctx) {
        ctx.state.mounts = mountsOf(ctx) + 1;
        ctx.state.self = ctx.state;
        show(ctx, 'loop');
      },
    });
    core = start({ parts: [], sections: [entry('shop:loop', looped)], preview: watchPreviewReplace });
    const html = `<merfy-section data-section="shop:loop" data-section-id="loop-1">${body}</merfy-section>`;
    expect(await replace(sectionOf('loop-1'), { html, script: { hash: V1, uses: [] } })).toEqual({
      outcome: 'fresh',
      message: '',
    });
    expect(clockOf('loop-1')).toBe('loop · запусков: 1 · нет');
  });

  it('секции не стало, пока загружался код, — failed', async () => {
    const log: string[] = [];
    openPreview(log);
    let finish: (value: unknown) => void = () => undefined;
    const load = (): Promise<unknown> =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const element = sectionOf('scarf-1');
    const pending = replace(element, { html: sectionHtml('scarf-1', 'Новый'), script: { hash: V2, uses: [] }, load });
    await tick();
    element.remove();
    finish(scarf('v2', log));
    expect(await pending).toEqual({ outcome: 'failed', message: REPLACE_TEXT.gone });
  });
});
