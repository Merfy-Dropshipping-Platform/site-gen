import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import { start, type StartedCore } from '../src/core/start';
import type { Result, SdkPart } from '../src/core/types';
import { configTag, entry, placeSection, tick, watchFailures } from './core-support';

// Имена в разметке: data-action (design.md блока 5, раздел 3.4). Один слушатель на тип события у <merfy-section>, для
// событий без всплытия — в фазе захвата; действие SDK с точкой работает и без скрипта секции.
let core: StartedCore | undefined;
let failures: ReturnType<typeof watchFailures>;

beforeEach(() => {
  failures = watchFailures();
  document.head.innerHTML = configTag('live');
});

afterEach(() => {
  core?.stop();
  core = undefined;
  failures.stop();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const button = (root: HTMLElement, selector = 'button'): HTMLElement | null =>
  root.querySelector<HTMLElement>(selector);

describe('data-action', () => {
  it('клик — actions.pick(обёртка элемента с data-action, ctx, событие); клик по вложенному элементу — тоже', () => {
    const calls: string[] = [];
    const section = defineSection({
      actions: {
        pick: (target, ctx, event) => {
          calls.push(`${ctx.id} ${target.attr('data-coat') ?? ''} ${event.type}`);
          target.toggleClass('picked');
        },
      },
    });
    const root = placeSection(
      'shop:scarf-match',
      'pick-1',
      '<button data-action="pick" data-coat="grey"><span>Серое</span></button>',
    );
    core = start({ parts: [], sections: [entry('shop:scarf-match', section)] });
    button(root, 'span')?.click();
    expect(calls).toEqual(['pick-1 grey click']);
    expect(button(root)?.classList.contains('picked')).toBe(true);
  });

  it('событие по умолчанию: input у полей, submit у формы (с preventDefault), click у остального; «событие:имя»; несколько через пробел', () => {
    const calls: string[] = [];
    const record = (name: string) => (_target: unknown, _ctx: unknown, event: { type: string }) => {
      calls.push(`${name} ${event.type}`);
    };
    const section = defineSection({
      actions: {
        typed: record('typed'),
        sent: record('sent'),
        entered: record('entered'),
        first: record('first'),
        second: record('second'),
      },
    });
    const root = placeSection(
      'shop:form',
      'form-1',
      '<input data-action="typed"><form data-action="sent"><button>Отправить</button></form>' +
        '<div data-action="mouseenter:entered click:first second"></div>',
    );
    core = start({ parts: [], sections: [entry('shop:form', section)] });
    root.querySelector('input')?.dispatchEvent(new Event('input', { bubbles: true }));
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    root.querySelector('form')?.dispatchEvent(submit);
    const block = root.querySelector('div');
    block?.dispatchEvent(new MouseEvent('mouseenter'));
    block?.click();
    expect(calls).toEqual(['typed input', 'sent submit', 'entered mouseenter', 'first click', 'second click']);
    expect(submit.defaultPrevented).toBe(true);
  });

  it('событие без всплытия — только у самого элемента с data-action, не у вложенного', () => {
    const entered = vi.fn();
    const root = placeSection(
      'shop:hover',
      'hover-1',
      '<div data-action="mouseenter:entered"><span>внутри</span></div>',
    );
    core = start({ parts: [], sections: [entry('shop:hover', defineSection({ actions: { entered } }))] });
    root.querySelector('span')?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(entered).not.toHaveBeenCalled();
    root.querySelector('div')?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(entered).toHaveBeenCalledTimes(1);
  });

  it('у ссылки с data-action переход остаётся, пока действие не вызвало preventDefault', () => {
    const section = defineSection({
      actions: { go: () => undefined, stay: (_target, _ctx, event) => event.preventDefault() },
    });
    const root = placeSection(
      'shop:links',
      'links-1',
      '<a href="#go" data-action="go">Дальше</a><a href="#stay" data-action="stay">Стоп</a>',
    );
    core = start({ parts: [], sections: [entry('shop:links', section)] });
    const go = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('[href="#go"]')?.dispatchEvent(go);
    const stay = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('[href="#stay"]')?.dispatchEvent(stay);
    expect(go.defaultPrevented).toBe(false);
    expect(stay.defaultPrevented).toBe(true);
  });

  it('пока действие идёт — aria-busy="true" и повторное нажатие его не вызывает; после ответа — снова можно', async () => {
    const release: Array<() => void> = [];
    const buy = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release.push(resolve);
        }),
    );
    const root = placeSection('shop:buy', 'buy-1', '<button data-action="buy">В корзину</button>');
    core = start({ parts: [], sections: [entry('shop:buy', defineSection({ actions: { buy } }))] });
    button(root)?.click();
    button(root)?.click();
    expect(buy).toHaveBeenCalledTimes(1);
    expect(button(root)?.getAttribute('aria-busy')).toBe('true');
    release.forEach((resolve) => resolve());
    await tick();
    expect(button(root)?.hasAttribute('aria-busy')).toBe(false);
    button(root)?.click();
    expect(buy).toHaveBeenCalledTimes(2);
  });

  it('действие SDK без скрипта секции: data-action="cart.add" — значения data-* по params части, остальные не идут', async () => {
    const received: Array<Readonly<Record<string, string>>> = [];
    const done: Result<null> = { ok: true, data: null };
    const cartPart: SdkPart<'cart', null> = {
      name: 'cart',
      create: () => null,
      markup: {
        add: {
          params: ['product-id', 'variant-id', 'quantity'],
          call: (_api, values) => {
            received.push(values);
            return Promise.resolve(done);
          },
        },
      },
    };
    const root = placeSection(
      'shop:buy',
      'buy-1',
      '<button data-action="cart.add" data-product-id="p12" data-quantity="2" data-extra="x">В корзину</button>',
    );
    core = start({ parts: [cartPart], sections: [] });
    button(root)?.click();
    expect(button(root)?.getAttribute('aria-busy')).toBe('true');
    await tick();
    expect(received).toEqual([{ 'product-id': 'p12', quantity: '2' }]);
    expect(button(root)?.hasAttribute('aria-busy')).toBe(false);
    expect(root.getAttribute('data-merfy-state')).toBe('mounted');
  });

  it('строки list: действия внутри строк работают, тип события ядро находит и в <template>', () => {
    const removed: string[] = [];
    const section = defineSection({
      mount(_el, ctx) {
        ctx.ref('lines')?.list(['p1', 'p2'], (row, id) => row.ref('remove')?.attr('data-product-id', id));
      },
      actions: { remove: (target) => void removed.push(target.attr('data-product-id') ?? '') },
    });
    const root = placeSection(
      'shop:lines',
      'lines-1',
      '<ul data-ref="lines"><template><li><button data-ref="remove" data-action="dblclick:remove">×</button></li></template></ul>',
    );
    core = start({ parts: [], sections: [entry('shop:lines', section)] });
    root.querySelectorAll('li button')[1]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(removed).toEqual(['p2']);
  });

  it('ошибка в действии — сбой runtime этого экземпляра: его нажатия больше ничего не вызывают, сосед работает', async () => {
    const clicks: string[] = [];
    const section = defineSection({
      actions: {
        boom: (_target, ctx) => {
          if (ctx.id === 'boom-1') throw new Error('клик сломался');
          clicks.push(ctx.id);
        },
        later: async () => {
          await tick();
          throw new Error('после await');
        },
      },
    });
    const broken = placeSection('shop:boom', 'boom-1', '<button data-action="boom">Сломать</button>');
    const fine = placeSection('shop:boom', 'boom-2', '<button data-action="boom">Нажать</button>');
    const slow = placeSection('shop:boom', 'boom-3', '<button data-action="later">Позже</button>');
    core = start({ parts: [], sections: [entry('shop:boom', section)] });
    button(broken)?.click();
    button(broken)?.click();
    button(fine)?.click();
    button(slow)?.click();
    await tick();
    await tick();
    expect(clicks).toEqual(['boom-2']);
    expect(broken.getAttribute('data-merfy-state')).toBe('failed');
    expect(button(broken)?.getAttribute('aria-disabled')).toBe('true');
    expect(button(slow)?.hasAttribute('aria-busy')).toBe(false);
    expect(failures.details.map((detail) => `${detail.id} ${detail.stage} ${detail.message}`)).toEqual([
      'boom-1 runtime клик сломался',
      'boom-3 runtime после await',
    ]);
  });

  it('действия нет ни у секции, ни у SDK — нажатие ничего не делает, сбоя нет', () => {
    const root = placeSection('shop:quiet', 'quiet-1', '<button data-action="nope">Ничего</button>');
    core = start({ parts: [], sections: [entry('shop:quiet', defineSection({ actions: {} }))] });
    button(root)?.click();
    expect(failures.details).toEqual([]);
    expect(root.getAttribute('data-merfy-state')).toBe('mounted');
  });
});
