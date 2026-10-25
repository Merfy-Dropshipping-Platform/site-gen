import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { defineSection } from '../src/core/define';
import { createEventBus } from '../src/core/events';
import { NOTICE_EVENT, unheardNoticeText } from '../src/core/notice-fallback';
import { start, type StartedCore } from '../src/core/start';
import type { CoreHandle, SectionEntry } from '../src/core/types';
import { configTag, corePart, entry, placeSection, tick, watchFailures } from './core-support';

// Уведомление без секции «Уведомления» на странице (блок 9, п. 10; Р9а-20, часть 9б): ядро пишет текст в console.warn.
// Секция подписана на merfy:notice:show (ctx.listen) — показывает она, консоль молчит. Копия на document — всегда.
const NOTICE = { level: 'error', message: 'Этого товара нет в наличии', code: 'out-of-stock' } as const;

let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;
let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
  failures = watchFailures();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

// Ядро с частью-шпионом: тест отправляет уведомление так же, как части SDK (failures.ts → core.emit).
function startWith(sections: readonly SectionEntry[]): CoreHandle {
  document.head.innerHTML = configTag('live');
  const spy = corePart();
  core = start({ parts: [spy.part], sections: [...sections] });
  if (spy.box.core === null) throw new Error('часть-шпион не создана');
  return spy.box.core;
}

// Секция, которая слушает уведомления, — как «Уведомления».
function listener(seen: unknown[]) {
  return defineSection({
    mount(_el, ctx) {
      ctx.listen('merfy:notice:show', (detail) => seen.push(detail));
    },
  });
}

describe('шина: есть ли подписка секции', () => {
  it('listening — true после listen, false после снятия; другое имя — false', () => {
    const bus = createEventBus(document);
    expect(bus.listening(NOTICE_EVENT)).toBe(false);
    const stop = bus.listen(NOTICE_EVENT, {}, () => undefined);
    expect([bus.listening(NOTICE_EVENT), bus.listening('merfy:cart:add')]).toEqual([true, false]);
    stop();
    expect(bus.listening(NOTICE_EVENT)).toBe(false);
  });
});

describe('уведомление без секции «Уведомления»', () => {
  it('никто не слушает — текст в console.warn, копия на document', () => {
    const copies: unknown[] = [];
    document.addEventListener(NOTICE_EVENT, (event) => copies.push(event instanceof CustomEvent ? event.detail : null));
    const handle = startWith([]);
    handle.emit('merfy:notice:show', NOTICE);
    expect(warn.mock.calls).toEqual([[unheardNoticeText('Этого товара нет в наличии')]]);
    expect(unheardNoticeText('Этого товара нет в наличии')).toBe(
      'Уведомление (секции «Уведомления» на странице нет): Этого товара нет в наличии',
    );
    expect(copies).toEqual([NOTICE]);
  });

  it('секция слушает — показывает она, консоль молчит', () => {
    const seen: unknown[] = [];
    placeSection('shop:notices', 'notices-1');
    const handle = startWith([entry('shop:notices', listener(seen))]);
    handle.emit('merfy:notice:show', { level: 'warning', message: 'Добавили 2 шт. — больше нет в наличии' });
    expect(seen).toEqual([{ level: 'warning', message: 'Добавили 2 шт. — больше нет в наличии' }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('секцию сняли со страницы — снова console.warn', async () => {
    const seen: unknown[] = [];
    const element = placeSection('shop:notices', 'notices-1');
    const handle = startWith([entry('shop:notices', listener(seen))]);
    element.remove();
    await tick();
    handle.emit('merfy:notice:show', NOTICE);
    expect(seen).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('другие события без подписчиков консоль не трогают', () => {
    const handle = startWith([]);
    handle.emit('merfy:cart:add', {
      lineId: 'l-1',
      productId: 'p12',
      variantId: null,
      quantity: 1,
      price: { amount: 249000, currency: 'RUB' },
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
