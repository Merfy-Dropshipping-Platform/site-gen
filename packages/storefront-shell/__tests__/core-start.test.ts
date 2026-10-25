import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import { start, type StartedCore } from '../src/core/start';
import { atom, readable } from '../src/core/stores';
import type { Ctx, InstanceHost, SdkPart } from '../src/core/types';
import {
  configTag,
  corePart,
  entry,
  hash,
  inputTag,
  placeSection,
  tick,
  watchFailures,
  FAILURE_EVENT,
} from './core-support';

// Жизненный цикл экземпляров (design.md блока 5, разделы 3.2, 3.6, 3.7): все секции разом, события страницы, снятие,
// перенос узла, сбой на экземпляр.
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
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

// Секция, которая пишет в журнал запуск и события страницы своего экземпляра.
function recorder(log: string[]) {
  return defineSection({
    mount(_el, ctx) {
      log.push(`mount ${ctx.id}`);
      ctx.listen('merfy:page:ready', () => log.push(`ready → ${ctx.id}`));
      ctx.listen('merfy:page:view', (detail) => log.push(`view ${detail.path} → ${ctx.id}`));
    },
  });
}

describe('старт: все секции разом', () => {
  it('порядок страницы, глобальный скрипт — после; page:ready и page:view — после синхронной части всех mount', () => {
    const log: string[] = [];
    document.head.innerHTML = configTag('live');
    placeSection('shop:a', 'a-1');
    placeSection('shop:b', 'b-1');
    placeSection('shop:a', 'a-2');
    core = start({
      parts: [],
      sections: [
        entry('shop:a', recorder(log)),
        entry('shop:b', recorder(log)),
        entry('shop:geo', recorder(log), { kind: 'global' }),
      ],
    });
    expect(log).toEqual([
      'mount a-1',
      'mount b-1',
      'mount a-2',
      'mount shop:geo',
      'ready → a-1',
      'ready → b-1',
      'ready → a-2',
      'ready → shop:geo',
      'view / → a-1',
      'view / → b-1',
      'view / → a-2',
      'view / → shop:geo',
    ]);
    const global = document.body.lastElementChild;
    expect(global?.getAttribute('data-section')).toBe('shop:geo');
    expect(global?.hasAttribute('data-merfy-global')).toBe(true);
    expect(global?.hasAttribute('hidden')).toBe(true);
  });

  it('асинхронное продолжение mount событий страницы не задерживает; подписка до await их получает', async () => {
    const log: string[] = [];
    document.head.innerHTML = configTag('live');
    placeSection('shop:slow', 'slow-1');
    const slow = defineSection({
      async mount(_el, ctx) {
        ctx.listen('merfy:page:ready', () => log.push('ready'));
        await tick();
        log.push('после await');
      },
    });
    core = start({ parts: [], sections: [entry('shop:slow', slow)] });
    expect(log).toEqual(['ready']);
    await tick();
    await tick();
    expect(log).toEqual(['ready', 'после await']);
  });

  it('data-merfy-state="mounted" и merfy:section:mount — когда mount закончился; секция без скрипта и разметки SDK — без экземпляра', async () => {
    const mounted: string[] = [];
    const onMount = (event: Event): void => {
      mounted.push(event instanceof CustomEvent ? JSON.stringify(event.detail) : '');
    };
    document.addEventListener('merfy:section:mount', onMount);
    document.head.innerHTML = configTag('live');
    const live = placeSection('shop:a', 'a-1');
    const still = placeSection('shop:static', 'static-1', '<p>Текст</p>');
    core = start({ parts: [], sections: [entry('shop:a', defineSection({ mount: () => undefined }))] });
    await tick();
    document.removeEventListener('merfy:section:mount', onMount);
    expect(live.getAttribute('data-merfy-state')).toBe('mounted');
    expect(still.hasAttribute('data-merfy-state')).toBe(false);
    expect(mounted).toEqual(['{"section":"shop:a"}']);
  });

  it('секция пришла в HTML с data-merfy-state="failed" (блок 12): экземпляр не запускается, признак остаётся', async () => {
    const log: string[] = [];
    document.head.innerHTML = configTag('live');
    const failed = placeSection('shop:a', 'a-1', '<p>Корзина</p>');
    failed.setAttribute('data-merfy-state', 'failed');
    core = start({ parts: [], sections: [entry('shop:a', recorder(log))] });
    await tick();
    expect(log).toEqual([]);
    expect(failed.getAttribute('data-merfy-state')).toBe('failed');
    expect(failures.details).toEqual([]);
  });

  it('новый элемент после старта (превью) запускается сразу; page:ready и page:view — только его подписчикам', async () => {
    const log: string[] = [];
    let views = 0;
    const countView = (): void => {
      views += 1;
    };
    document.addEventListener('merfy:page:view', countView);
    document.head.innerHTML = configTag('preview');
    placeSection('shop:a', 'a-1');
    core = start({ parts: [], sections: [entry('shop:a', recorder(log))] });
    log.length = 0;
    placeSection('shop:a', 'a-9');
    await tick();
    document.removeEventListener('merfy:page:view', countView);
    expect(log).toEqual(['mount a-9', 'ready → a-9', 'view / → a-9']);
    expect(views).toBe(1);
  });
});

describe('ctx', () => {
  it('имя, id, режим, входные данные, адрес страницы; ctx и данные заморожены, state — свой у экземпляра', () => {
    const box: { ctx: Ctx | null } = { ctx: null };
    window.history.replaceState(null, '', '/verify?token=abc&n=12');
    document.head.innerHTML = configTag('preview');
    const input = {
      settings: { title: 'Подберите шарф' },
      blocks: [{ id: 'scarf-1', type: 'scarf', settings: { name: 'Кашемир' } }],
      data: {},
    };
    placeSection('shop:scarf-match', 'pick-1', `<p>Подбор</p>${inputTag(input)}`);
    const capture = defineSection({
      mount(_el, ctx) {
        box.ctx = ctx;
      },
    });
    core = start({ parts: [], sections: [entry('shop:scarf-match', capture)] });
    const ctx = box.ctx;
    expect(ctx?.name).toBe('shop:scarf-match');
    expect(ctx?.id).toBe('pick-1');
    expect(ctx?.mode).toBe('preview');
    expect(ctx?.settings).toEqual(input.settings);
    expect(ctx?.blocks).toEqual(input.blocks);
    expect(ctx?.data).toEqual({});
    expect(ctx?.page).toEqual({ path: '/verify', query: { token: 'abc', n: '12' } });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx?.settings)).toBe(true);
    expect(Object.isFrozen(ctx?.page.query)).toBe(true);
    expect(ctx?.signal.aborted).toBe(false);
  });

  it('state — изменяемый объект экземпляра; ctx.state = {…} заменяет его, хотя ctx заморожен', () => {
    const states: Array<Partial<Record<string, unknown>>> = [];
    document.head.innerHTML = configTag('live');
    placeSection('shop:a', 'a-1');
    placeSection('shop:a', 'a-2');
    const section = defineSection({
      mount(_el, ctx) {
        ctx.state.coat = ctx.id;
        if (ctx.id === 'a-2') ctx.state = { coat: 'заменили' };
        states.push(ctx.state);
      },
    });
    core = start({ parts: [], sections: [entry('shop:a', section)] });
    expect(states).toEqual([{ coat: 'a-1' }, { coat: 'заменили' }]);
  });

  it('модули — только по uses; часть создаётся один раз на страницу', () => {
    const box: { withCart: Ctx | null; without: Ctx | null } = { withCart: null, without: null };
    const create = vi.fn(() => ({ marker: 'корзина' }));
    const cartPart: SdkPart<'cart', { marker: string }> = { name: 'cart', create };
    document.head.innerHTML = configTag('live');
    placeSection('shop:badge', 'badge-1');
    placeSection('shop:badge', 'badge-2');
    placeSection('shop:hint', 'hint-1');
    core = start({
      parts: [cartPart],
      sections: [
        entry('shop:badge', defineSection({ mount: (_el, ctx) => void (box.withCart = ctx) }), { uses: ['cart'] }),
        entry('shop:hint', defineSection({ mount: (_el, ctx) => void (box.without = ctx) })),
      ],
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(box.withCart?.cart).toEqual({ marker: 'корзина' });
    expect(box.without === null ? null : 'cart' in box.without).toBe(false);
  });

  it('ctx.log: в превью — console.info с именем и id; на витрине ничего', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const section = defineSection({ mount: (_el, ctx) => ctx.log('выбрано', { coat: 'grey' }) });
    document.head.innerHTML = configTag('preview');
    placeSection('shop:scarf-match', 'pick-1');
    core = start({ parts: [], sections: [entry('shop:scarf-match', section)] });
    expect(info).toHaveBeenCalledWith('[shop:scarf-match#pick-1]', 'выбрано', { coat: 'grey' });
    core.stop();
    info.mockClear();
    document.head.innerHTML = configTag('live');
    document.body.replaceChildren();
    placeSection('shop:scarf-match', 'pick-1');
    core = start({ parts: [], sections: [entry('shop:scarf-match', section)] });
    expect(info).not.toHaveBeenCalled();
  });

  it('ctx.emit — событие «<имя секции>:<имя>» на document с замороженной копией', () => {
    const seen: unknown[] = [];
    const onPicked = (event: Event): void => {
      seen.push(event instanceof CustomEvent ? event.detail : null);
    };
    document.addEventListener('shop:scarf-match:coat-picked', onPicked);
    document.head.innerHTML = configTag('live');
    placeSection('shop:scarf-match', 'pick-1');
    const section = defineSection({ mount: (_el, ctx) => ctx.emit('coat-picked', { coat: 'grey' }) });
    core = start({ parts: [], sections: [entry('shop:scarf-match', section)] });
    document.removeEventListener('shop:scarf-match:coat-picked', onPicked);
    expect(seen).toEqual([{ coat: 'grey' }]);
    expect(Object.isFrozen(seen[0])).toBe(true);
  });

  it('every — не чаще раза в 100 мс; after — один раз; Stop останавливает; ctx.on — события страницы', () => {
    vi.useFakeTimers();
    const counts = { every: 0, after: 0, stopped: 0 };
    const keys: string[] = [];
    document.head.innerHTML = configTag('live');
    placeSection('shop:ticker', 'ticker-1');
    const section = defineSection({
      mount(_el, ctx) {
        ctx.every(10, () => {
          counts.every += 1;
        });
        ctx.after(500, () => {
          counts.after += 1;
        });
        const stop = ctx.every(100, () => {
          counts.stopped += 1;
        });
        stop();
        ctx.on('document', 'keydown', (event) => keys.push(event.key ?? ''));
      },
    });
    core = start({ parts: [], sections: [entry('shop:ticker', section)] });
    vi.advanceTimersByTime(1000);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(counts).toEqual({ every: 10, after: 1, stopped: 0 });
    expect(keys).toEqual(['Escape']);
  });

  it('watch — сразу текущее значение, потом каждое новое; значение заморожено', () => {
    const value = atom({ count: 0 });
    const $value = readable(value);
    const seen: Array<{ count: number }> = [];
    document.head.innerHTML = configTag('live');
    placeSection('shop:badge', 'badge-1');
    const section = defineSection({ mount: (_el, ctx) => void ctx.watch($value, (next) => seen.push(next)) });
    core = start({ parts: [], sections: [entry('shop:badge', section)] });
    value.set({ count: 2 });
    expect(seen).toEqual([{ count: 0 }, { count: 2 }]);
    expect(Object.isFrozen(seen[1])).toBe(true);
  });
});

describe('снятие и перенос', () => {
  it('удаление секции снимает таймеры, обработчики, подписки и сторы: через 3 с ни одного вызова; unmount — один раз', async () => {
    vi.useFakeTimers();
    const value = atom(0);
    const $value = readable(value);
    const calls = { every: 0, after: 0, on: 0, watch: 0, listen: 0, unmount: 0 };
    const spy = corePart();
    const section = defineSection({
      mount(_el, ctx) {
        ctx.every(100, () => void (calls.every += 1));
        ctx.after(1000, () => void (calls.after += 1));
        ctx.on('window', 'resize', () => void (calls.on += 1));
        ctx.watch($value, () => void (calls.watch += 1));
        ctx.listen('merfy:page:visible', () => void (calls.listen += 1));
      },
      unmount: () => void (calls.unmount += 1),
    });
    document.head.innerHTML = configTag('live');
    const element = placeSection('shop:ticker', 'ticker-1');
    core = start({ parts: [spy.part], sections: [entry('shop:ticker', section)] });
    vi.advanceTimersByTime(250);
    expect(calls).toEqual({ every: 2, after: 0, on: 0, watch: 1, listen: 0, unmount: 0 });
    element.remove();
    await tick();
    vi.advanceTimersByTime(3000);
    window.dispatchEvent(new Event('resize'));
    value.set(5);
    spy.box.core?.emit('merfy:page:visible', {});
    expect(calls).toEqual({ every: 2, after: 0, on: 0, watch: 1, listen: 0, unmount: 1 });
  });

  it('перенос узла в документе не перезапускает секцию', async () => {
    const mount = vi.fn();
    const unmount = vi.fn();
    document.head.innerHTML = configTag('live');
    const moved = placeSection('shop:a', 'a-1');
    placeSection('shop:b', 'b-1');
    core = start({ parts: [], sections: [entry('shop:a', defineSection({ mount, unmount }))] });
    document.body.append(moved);
    await tick();
    expect(mount).toHaveBeenCalledTimes(1);
    expect(unmount).not.toHaveBeenCalled();
    expect(moved.getAttribute('data-merfy-state')).toBe('mounted');
  });

  it('attach части — до mount, с сигналом экземпляра; у секции без скрипта с data-behavior тоже', async () => {
    const order: string[] = [];
    const hosts: InstanceHost[] = [];
    const behaviors: SdkPart<'behaviors', null> = {
      name: 'behaviors',
      create: () => null,
      attach: (_api, host) => {
        order.push(`attach ${host.id}`);
        hosts.push(host);
      },
    };
    document.head.innerHTML = configTag('live');
    const slider = placeSection('shop:slider', 'slider-1', '<div data-behavior="carousel"></div>');
    placeSection('shop:a', 'a-1');
    const section = defineSection({ mount: (_el, ctx) => void order.push(`mount ${ctx.id}`) });
    core = start({ parts: [behaviors], sections: [entry('shop:a', section)] });
    expect(order).toEqual(['attach slider-1', 'attach a-1', 'mount a-1']);
    expect(hosts[0]?.element).toBe(slider);
    expect(hosts[0]?.mode).toBe('live');
    slider.remove();
    await tick();
    expect(hosts[0]?.signal.aborted).toBe(true);
    expect(hosts[1]?.signal.aborted).toBe(false);
  });
});

describe('сбой на экземпляр', () => {
  it('ошибка в mount: экземпляр снят, failed без inert, кнопки с data-action — aria-disabled; соседний экземпляр той же секции работает', () => {
    document.head.innerHTML = configTag('live');
    const broken = placeSection(
      'shop:pick',
      'pick-1',
      '<button data-action="pick">Подобрать</button><a href="#done">Дальше</a>',
    );
    const fine = placeSection('shop:pick', 'pick-2', '<button data-action="pick">Подобрать</button>');
    const section = defineSection({
      mount(_el, ctx) {
        if (ctx.id === 'pick-1') throw new Error('сломалась при запуске');
      },
    });
    core = start({ parts: [], sections: [entry('shop:pick', section, { script: hash('b') })] });
    expect(broken.getAttribute('data-merfy-state')).toBe('failed');
    expect(broken.hasAttribute('inert')).toBe(false);
    expect(broken.querySelector('button')?.getAttribute('aria-disabled')).toBe('true');
    expect(broken.querySelector('a')?.hasAttribute('aria-disabled')).toBe(false);
    expect(fine.getAttribute('data-merfy-state')).toBe('mounted');
    expect(fine.querySelector('button')?.hasAttribute('aria-disabled')).toBe(false);
    expect(failures.details).toEqual([
      { section: 'shop:pick', id: 'pick-1', script: hash('b'), stage: 'mount', message: 'сломалась при запуске' },
    ]);
    expect(failures.consoleError).toHaveBeenCalledWith('Сбой секции shop:pick#pick-1 (mount): сломалась при запуске');
  });

  it('ошибка после запуска — в таймере, подписке, после await в mount: стадии runtime и mount; одна запись на экземпляр', async () => {
    vi.useFakeTimers();
    document.head.innerHTML = configTag('live');
    placeSection('shop:timer', 'timer-1');
    placeSection('shop:async', 'async-1');
    const timer = defineSection({
      mount(_el, ctx) {
        ctx.every(100, () => {
          throw new Error('таймер');
        });
      },
    });
    const late = defineSection({
      async mount() {
        await tick();
        throw new Error('после await');
      },
    });
    core = start({ parts: [], sections: [entry('shop:timer', timer), entry('shop:async', late)] });
    await tick();
    await tick();
    vi.advanceTimersByTime(1000);
    const seen = failures.details.map((detail) => `${detail.section} ${detail.stage} ${detail.message}`).sort();
    expect(seen).toEqual(['shop:async mount после await', 'shop:timer runtime таймер']);
  });

  it('битый тег входных данных: mount не вызван, HTML на месте, сбой mount «не удалось разобрать входные данные»', () => {
    const mount = vi.fn();
    document.head.innerHTML = configTag('live');
    const element = placeSection(
      'shop:a',
      'a-1',
      '<p>Подбор</p><script type="application/json" data-merfy-input>{"settings":</script>',
    );
    core = start({ parts: [], sections: [entry('shop:a', defineSection({ mount }))] });
    expect(mount).not.toHaveBeenCalled();
    expect(element.querySelector('p')?.textContent).toBe('Подбор');
    expect(element.getAttribute('data-merfy-state')).toBe('failed');
    expect(failures.details).toEqual([
      {
        section: 'shop:a',
        id: 'a-1',
        script: hash('a'),
        stage: 'mount',
        message: 'не удалось разобрать входные данные',
      },
    ]);
  });

  it('ошибка в unmount — запись со стадией unmount', async () => {
    document.head.innerHTML = configTag('live');
    const element = placeSection('shop:a', 'a-1');
    const section = defineSection({
      unmount() {
        throw new Error('снятие сломалось');
      },
    });
    core = start({ parts: [], sections: [entry('shop:a', section)] });
    element.remove();
    await tick();
    expect(failures.details.map((detail) => detail.stage)).toEqual(['unmount']);
  });

  it('событие сбоя приходит и подписчикам секций — ctx.listen(merfy:section:error)', () => {
    const heard: string[] = [];
    document.head.innerHTML = configTag('live');
    placeSection('shop:watcher', 'watcher-1');
    placeSection('shop:broken', 'broken-1');
    const watcher = defineSection({
      mount: (_el, ctx) => void ctx.listen('merfy:section:error', (detail) => heard.push(detail.section)),
    });
    const brokenSection = defineSection({
      mount() {
        throw new Error('сломалась');
      },
    });
    core = start({
      parts: [],
      sections: [entry('shop:watcher', watcher), entry('shop:broken', brokenSection)],
    });
    expect(heard).toEqual(['shop:broken']);
    expect(FAILURE_EVENT).toBe('merfy:section:error');
  });
});
