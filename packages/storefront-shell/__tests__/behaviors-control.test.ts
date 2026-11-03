import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BehaviorName } from '../src/core/behaviors/catalog';
import { done } from '../src/core/behaviors/command';
import { behaviors } from '../src/core/behaviors/part';
import type { Behavior, BehaviorCommand, BehaviorInstance } from '../src/core/behaviors/types';
import { start, type StartedCore } from '../src/core/start';
import type { BehaviorHandles, Ctx, El, NoData, Result } from '../src/core/types';
import { configTag, entry, placeSection, watchFailures } from './core-support';

// ctx.behavior (03.11): скрипт секции командует поведениями своей разметки. Поведения здесь — шпионы с командами:
// проверяется путь от ctx до поведения — выбор поведения, проверка аргумента, изоляция секций и тексты отказов.
type Calls = [command: string, arg: unknown][];

// Поведение-шпион: команды из списка пишут вызов и отвечают ok.
function spy<N extends BehaviorName>(name: N, commands: readonly string[], calls: Calls = []) {
  const table: Record<string, BehaviorCommand> = {};
  commands.forEach((command) => {
    table[command] = (arg) => {
      calls.push([command, arg]);
      return done();
    };
  });
  const instance: BehaviorInstance = { commands: table };
  const behavior: Behavior<N> = { name, attach: () => instance };
  return { behavior, calls };
}

const ACCORDION = ['open', 'close', 'toggle'];
const DIALOG = ['open', 'close', 'toggle'];

let started: StartedCore | null = null;
let failures: ReturnType<typeof watchFailures>;

beforeEach(() => {
  document.head.innerHTML = configTag('live');
  failures = watchFailures();
});

afterEach(() => {
  started?.stop();
  started = null;
  failures.stop();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

// ctx.behavior с любым именем и любым аргументом — как его вызовет код, обошедший типы. Без command — сам объект команд.
function call(ctx: Ctx, name: string, command?: string, arg?: unknown): unknown {
  const behavior: unknown = Reflect.get(ctx, 'behavior');
  if (typeof behavior !== 'function') throw new Error('у ctx нет behavior');
  const handle: unknown = Reflect.apply(behavior, ctx, [name]);
  if (command === undefined) return handle;
  const run: unknown = Reflect.get(Object(handle), command);
  return typeof run === 'function' ? Reflect.apply(run, handle, [arg]) : undefined;
}

const consoleTexts =(): string[] => failures.consoleError.mock.calls.map((call) => call.map(String).join(' '));

// Что вернул или бросил вызов в mount: ошибка кода секции — текст, а не сбой теста.
function attempt<T>(run: () => T): { value: T | null; error: string | null } {
  try {
    return { value: run(), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

describe('ctx.behavior — команды поведений', () => {
  it('команда доходит до поведения своей разметки с аргументом; ответ — ok', () => {
    const accordion = spy('accordion', ACCORDION);
    const results: Result<NoData>[] = [];
    placeSection('test-ext:faq', 'f1', '<div data-behavior="accordion"></div>');
    started = start({
      parts: [behaviors({ list: [accordion.behavior] })],
      sections: [
        entry('test-ext:faq', {
          mount: (_el, ctx) => {
            results.push(ctx.behavior('accordion').open(2), ctx.behavior('accordion').toggle('q-delivery'));
          },
        }),
      ],
    });
    expect(accordion.calls).toEqual([
      ['open', 2],
      ['toggle', 'q-delivery'],
    ]);
    expect(results).toEqual([done(), done()]);
  });

  it('команды вызываются и позже mount — из таймера и события страницы', async () => {
    vi.useFakeTimers();
    try {
      const dialog = spy('dialog', DIALOG);
      placeSection('test-ext:promo', 'p1', '<div data-behavior="dialog"></div>');
      started = start({
        parts: [behaviors({ list: [dialog.behavior] })],
        sections: [
          entry('test-ext:promo', {
            mount: (_el, ctx) => {
              ctx.after(1000, () => {
                ctx.behavior('dialog').open({ position: 'corner', side: 'left' });
              });
            },
          }),
        ],
      });
      expect(dialog.calls).toEqual([]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(dialog.calls).toEqual([['open', { position: 'corner', side: 'left' }]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('несколько одинаковых поведений: без элемента — отказ, с элементом внутри нужного — оно', () => {
    const first = spy('accordion', ACCORDION);
    const calls: Calls = [];
    const second = spy('accordion', ACCORDION, calls);
    // Один код поведения на имя, экземпляров два: подставляем по порядку подключения.
    let index = 0;
    const accordion: Behavior<'accordion'> = {
      name: 'accordion',
      attach: (host) => (index++ === 0 ? first.behavior.attach(host) : second.behavior.attach(host)),
    };
    let withoutEl: string | null = null;
    placeSection(
      'test-ext:faq',
      'f1',
      '<div data-behavior="accordion"></div><div data-behavior="accordion"><b data-ref="second">2</b></div>',
    );
    started = start({
      parts: [behaviors({ list: [accordion] })],
      sections: [
        entry('test-ext:faq', {
          mount: (_el, ctx) => {
            withoutEl = attempt(() => ctx.behavior('accordion')).error;
            const inside = ctx.ref('second');
            if (inside !== null) ctx.behavior('accordion', inside).close(0);
          },
        }),
      ],
    });
    expect(withoutEl).toContain('несколько таких поведений');
    expect(first.calls).toEqual([]);
    expect(calls).toEqual([['close', 0]]);
  });

  it('изоляция: вложенная секция не мешает выбору поведения, а каждая секция командует только своим', () => {
    const own = spy('accordion', ACCORDION);
    const inner = spy('accordion', ACCORDION);
    const other = spy('accordion', ACCORDION);
    const byId = new Map([
      ['outer', own],
      ['inner', inner],
      ['other', other],
    ]);
    const accordion: Behavior<'accordion'> = {
      name: 'accordion',
      attach: (host) => {
        const found = byId.get(host.section.getAttribute('data-section-id') ?? '');
        return found === undefined ? {} : found.behavior.attach(host);
      },
    };
    placeSection(
      'test-ext:outer',
      'outer',
      '<div data-behavior="accordion"></div>' +
        '<merfy-section data-section="test-ext:inner" data-section-id="inner"><div data-behavior="accordion"></div></merfy-section>',
    );
    placeSection('test-ext:other', 'other', '<div data-behavior="accordion"></div>');
    started = start({
      parts: [behaviors({ list: [accordion] })],
      sections: [
        entry('test-ext:outer', {
          mount: (_el, ctx) => {
            ctx.behavior('accordion').open(0); // единственное своё: поведение вложенной секции не считается
          },
        }),
        entry('test-ext:inner', {
          mount: (_el, ctx) => {
            ctx.behavior('accordion').close(1);
          },
        }),
        entry('test-ext:other', {
          mount: (_el, ctx) => {
            ctx.behavior('accordion').toggle('id');
          },
        }),
      ],
    });
    expect(own.calls).toEqual([['open', 0]]);
    expect(inner.calls).toEqual([['close', 1]]);
    expect(other.calls).toEqual([['toggle', 'id']]);
  });

  it('элемент из другой секции — отказ с текстом', () => {
    const accordion = spy('accordion', ACCORDION);
    const shared: { el: El | null } = { el: null };
    let message: string | null = null;
    placeSection('test-ext:first', 'a', '<div data-behavior="accordion"></div><i data-ref="mine"></i>');
    placeSection('test-ext:second', 'b', '<div data-behavior="accordion"></div>');
    started = start({
      parts: [behaviors({ list: [accordion.behavior] })],
      sections: [
        entry('test-ext:first', {
          mount: (_el, ctx) => {
            shared.el = ctx.ref('mine');
          },
        }),
        entry('test-ext:second', {
          mount: (_el, ctx) => {
            message = attempt(() => (shared.el === null ? null : ctx.behavior('accordion', shared.el))).error;
          },
        }),
      ],
    });
    expect(message).toBe('ctx.behavior("accordion"): элемент не из этой секции');
    expect(accordion.calls).toEqual([]);
  });

  it('в разметке секции нет такого поведения; у поведения нет команд; кода поведения нет в скрипте страницы', () => {
    const accordion = spy('accordion', ACCORDION);
    const texts: Record<string, string | null> = {};
    placeSection('test-ext:faq', 'f', '<div data-behavior="accordion"></div><div data-behavior="quantity"></div>');
    placeSection('test-ext:slides', 's', '<div data-behavior="carousel"></div>');
    started = start({
      parts: [behaviors({ list: [accordion.behavior] })],
      sections: [
        entry('test-ext:faq', {
          mount: (_el, ctx) => {
            texts.noMarkup = attempt(() => ctx.behavior('tabs')).error;
            texts.noCommands = attempt(() => call(ctx, 'quantity')).error;
          },
        }),
        entry('test-ext:slides', {
          mount: (_el, ctx) => {
            texts.noCode = attempt(() => ctx.behavior('carousel')).error;
          },
        }),
      ],
    });
    expect(texts.noMarkup).toBe('ctx.behavior("tabs"): в разметке секции нет data-behavior="tabs"');
    expect(texts.noCommands).toContain('команды есть у');
    expect(texts.noCode).toContain('кода поведения нет на странице');
  });

  it('на странице нет части behaviors — понятная ошибка, секция не падает целиком', () => {
    let message: string | null = null;
    placeSection('test-ext:faq', 'f', '<div></div>');
    started = start({
      parts: [],
      sections: [
        entry('test-ext:faq', {
          mount: (_el, ctx) => {
            message = attempt(() => ctx.behavior('dialog')).error;
          },
        }),
      ],
    });
    expect(message).toBe('ctx.behavior: нет data-behavior');
  });

  it('аргумент проверяет часть: неверный — invalid и строка в консоль, поведение не вызвано', () => {
    const accordion = spy('accordion', ACCORDION);
    const carousel = spy('carousel', ['next', 'prev', 'goTo', 'play', 'pause']);
    const tabs = spy('tabs', ['select']);
    const dialog = spy('dialog', DIALOG);
    const answers: unknown[] = [];
    placeSection(
      'test-ext:all',
      'a',
      '<div data-behavior="accordion"></div><div data-behavior="carousel"></div><div data-behavior="tabs"></div><div data-behavior="dialog"></div>',
    );
    started = start({
      parts: [behaviors({ list: [accordion.behavior, carousel.behavior, tabs.behavior, dialog.behavior] })],
      sections: [
        entry('test-ext:all', {
          mount: (_el, ctx: Ctx) => {
            answers.push(
              call(ctx, 'accordion', 'open', -1),
              call(ctx, 'carousel', 'goTo', 1.5),
              call(ctx, 'tabs', 'select', ''),
              call(ctx, 'dialog', 'open', 5),
            );
          },
        }),
      ],
    });
    const invalid = { ok: false, error: { code: 'invalid' } };
    expect(answers).toMatchObject([invalid, invalid, invalid, invalid]);
    expect([accordion.calls, carousel.calls, tabs.calls, dialog.calls]).toEqual([[], [], [], []]);
    expect(consoleTexts().filter((text) => text.startsWith('ctx.behavior('))).toHaveLength(4);
  });

  it('поведение без этой команды в разметке — refused; после снятия секции — refused', () => {
    const empty: BehaviorInstance = {};
    const dialog: Behavior<'dialog'> = { name: 'dialog', attach: () => empty };
    const out: Record<string, Result<NoData> | undefined> = {};
    const keep: { handle: BehaviorHandles['dialog'] | null; ctx: Ctx | null } = { handle: null, ctx: null };
    placeSection('test-ext:promo', 'p', '<div data-behavior="dialog"></div>');
    started = start({
      parts: [behaviors({ list: [dialog] })],
      sections: [
        entry('test-ext:promo', {
          mount: (_el, ctx) => {
            keep.handle = ctx.behavior('dialog');
            keep.ctx = ctx;
            out.noCommand = keep.handle.close();
          },
        }),
      ],
    });
    expect(out.noCommand).toMatchObject({ ok: false, error: { code: 'refused' } });
    started.stop();
    started = null;
    // Команда из сохранённого объекта — refused; новый выбор поведения у снятой секции — ошибка с понятным текстом.
    expect(keep.handle?.toggle()).toMatchObject({ ok: false, error: { code: 'refused' } });
    expect(attempt(() => keep.ctx?.behavior('dialog')).error).toBe('ctx.behavior("dialog"): секция уже снята со страницы');
  });
});
