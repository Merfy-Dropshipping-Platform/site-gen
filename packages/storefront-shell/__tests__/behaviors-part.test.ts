import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BehaviorName } from '../src/core/behaviors/catalog';
import { MOTION_FLAG } from '../src/core/behaviors/motion-css';
import { behaviors } from '../src/core/behaviors/part';
import type {
  AnimateProvider,
  Behavior,
  BehaviorHost,
  BehaviorInstance,
  BehaviorsApi,
  BehaviorsOptions,
  BehaviorsPart,
  RevealHost,
} from '../src/core/behaviors/types';
import { start, type StartedCore } from '../src/core/start';
import type { CoreHandle } from '../src/core/types';
import { configTag, entry, placeSection, tick, watchFailures } from './core-support';

// Часть behaviors поверх ядра 5а (design.md блока 6, раздел 2): поведения подключаются до mount, снимаются сигналом
// экземпляра; появления — одним вызовом на секцию; save и restore — для замены экземпляра в превью (часть 6б).
function spy<N extends BehaviorName>(name: N, instance: BehaviorInstance = {}) {
  const hosts: BehaviorHost[] = [];
  const behavior: Behavior<N> = {
    name,
    attach: (host) => {
      hosts.push(host);
      return instance;
    },
  };
  return { behavior, hosts };
}

// Часть с API наружу: тест зовёт save и restore так, как их позовёт превью.
function withApi(options: BehaviorsOptions) {
  const part = behaviors(options);
  const box: { api: BehaviorsApi | null } = { api: null };
  const wrapped: BehaviorsPart = { ...part, create: (core) => (box.api = part.create(core)) };
  return { part: wrapped, box };
}

const errorTexts = (failures: ReturnType<typeof watchFailures>): string[] =>
  failures.consoleError.mock.calls.map((call) => call.map(String).join(' '));

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
  document.documentElement.removeAttribute(MOTION_FLAG);
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('часть behaviors', () => {
  it('поведение подключается до mount: корень, секция, параметры, настройки движения, сигнал', () => {
    const log: string[] = [];
    const carousel = spy('carousel');
    const { part } = withApi({ list: [carousel.behavior] });
    const section = placeSection('shop:slides', 's1', '<div data-behavior="carousel" data-autoplay="3"></div>');
    started = start({
      parts: [part],
      sections: [entry('shop:slides', { mount: () => void log.push(`mount, подключено: ${carousel.hosts.length}`) })],
    });
    expect(log).toEqual(['mount, подключено: 1']);
    const host = carousel.hosts[0];
    expect(host?.root).toBe(section.firstElementChild);
    expect(host?.section).toBe(section);
    expect(host?.params).toMatchObject({ autoplay: 3, effect: 'slide' });
    expect(host?.motion).toEqual({ reduced: false, preview: false });
    expect(host?.signal.aborted).toBe(false);
  });

  it('секция без скрипта: поведения подключаются; вложенная секция берёт только свои', () => {
    const quantity = spy('quantity');
    const { part } = withApi({ list: [quantity.behavior] });
    placeSection(
      'shop:outer',
      'o',
      '<div data-behavior="quantity" id="a"></div>' +
        '<merfy-section data-section="shop:inner" data-section-id="i"><div data-behavior="quantity" id="b"></div></merfy-section>',
    );
    started = start({ parts: [part], sections: [] });
    expect(quantity.hosts.map((host) => [host.root.id, host.section.getAttribute('data-section-id')])).toEqual([
      ['a', 'o'],
      ['b', 'i'],
    ]);
  });

  it('sticky-header — на самой секции; другое имя на секции не подключается и пишется в консоль', () => {
    const sticky = spy('sticky-header');
    const accordion = spy('accordion');
    const { part } = withApi({ list: [sticky.behavior, accordion.behavior] });
    const header = placeSection('shop:header', 'h');
    header.setAttribute('data-behavior', 'sticky-header');
    header.setAttribute('data-mode', 'always');
    placeSection('shop:faq', 'f').setAttribute('data-behavior', 'accordion');
    started = start({ parts: [part], sections: [] });
    expect(sticky.hosts[0]?.root).toBe(header);
    expect(sticky.hosts[0]?.params).toEqual({ mode: 'always' });
    expect(accordion.hosts).toEqual([]);
    expect(errorTexts(failures).filter((text) => text.includes('accordion'))).toHaveLength(1);
  });

  it('имени нет в каталоге или в скрипте страницы — одна запись на имя; секция работает', async () => {
    const { part } = withApi({ list: [] });
    placeSection(
      'shop:a',
      'a',
      '<div data-behavior="zoom"></div><div data-behavior="zoom"></div><div data-behavior="dialog"></div>',
    );
    placeSection('shop:b', 'b', '<div data-behavior="zoom"></div>');
    started = start({ parts: [part], sections: [entry('shop:a', {})] });
    await tick();
    expect(errorTexts(failures).filter((text) => text.includes('zoom'))).toHaveLength(1);
    expect(errorTexts(failures).filter((text) => text.includes('dialog'))).toHaveLength(1);
    expect(document.querySelector('merfy-section')?.getAttribute('data-merfy-state')).toBe('mounted');
    expect(failures.details).toEqual([]);
  });

  it('ошибка поведения — запись с именем и секцией; следующие поведения подключаются; сбоя секции нет', async () => {
    const broken: Behavior<'tabs'> = {
      name: 'tabs',
      attach: () => {
        throw new Error('сломалось');
      },
    };
    const quantity = spy('quantity');
    const { part } = withApi({ list: [broken, quantity.behavior] });
    placeSection('shop:a', 'a', '<div data-behavior="tabs"></div><div data-behavior="quantity"></div>');
    started = start({ parts: [part], sections: [] });
    await tick();
    expect(quantity.hosts).toHaveLength(1);
    expect(
      errorTexts(failures).some(
        (text) => text.includes('tabs') && text.includes('shop:a') && text.includes('сломалось'),
      ),
    ).toBe(true);
    expect(failures.details).toEqual([]);
  });

  it('снятие секции отменяет сигнал поведения', async () => {
    const quantity = spy('quantity');
    const { part } = withApi({ list: [quantity.behavior] });
    const section = placeSection('shop:a', 'a', '<div data-behavior="quantity"></div>');
    started = start({ parts: [part], sections: [] });
    section.remove();
    await tick();
    expect(quantity.hosts[0]?.signal.aborted).toBe(true);
  });
});

describe('появления data-animate', () => {
  it('элементы секции — одним вызовом reveal.attach, по порядку документа; секция с data-animate — тоже', () => {
    const calls: RevealHost[] = [];
    const { part } = withApi({ list: [], reveal: { attach: (host) => void calls.push(host) } });
    const a = placeSection(
      'shop:a',
      'a',
      '<h2 data-animate="appear" id="h"></h2><p data-animate="fade-up" id="p"></p>' +
        '<merfy-section data-section="shop:b" data-section-id="b"><p data-animate="appear" id="inner"></p></merfy-section>',
    );
    const side = placeSection('shop:c', 'c', '<p>текст</p>');
    side.setAttribute('data-animate', 'appear-side');
    side.id = 'side';
    started = start({ parts: [part], sections: [] });
    expect(calls.map((host) => host.elements.map((element) => element.id))).toEqual([['h', 'p'], ['inner'], ['side']]);
    expect(calls[0]?.section).toBe(a);
    expect(calls[0]?.signal.aborted).toBe(false);
  });

  it('кода появлений нет в скрипте страницы — одна запись на страницу', () => {
    const { part } = withApi({ list: [] });
    placeSection('shop:a', 'a', '<h2 data-animate="appear"></h2>');
    placeSection('shop:b', 'b', '<h2 data-animate="appear"></h2>');
    started = start({ parts: [part], sections: [] });
    expect(errorTexts(failures).filter((text) => text.includes('data-animate'))).toHaveLength(1);
  });

  it('флаг data-merfy-motion (его ставит скрипт в <head>): при подключении он есть, после merfy:page:ready — снят', async () => {
    document.documentElement.setAttribute(MOTION_FLAG, 'pending');
    const seen: boolean[] = [];
    const { part } = withApi({
      list: [],
      reveal: { attach: () => void seen.push(document.documentElement.hasAttribute(MOTION_FLAG)) },
    });
    placeSection('shop:a', 'a', '<p data-animate="appear"></p>');
    started = start({ parts: [part], sections: [] });
    await tick();
    expect(seen).toEqual([true]);
    expect(document.documentElement.hasAttribute(MOTION_FLAG)).toBe(false);
  });
});

describe('API части', () => {
  it('save и restore по id секции: состояние переживает замену экземпляра', async () => {
    const restored: unknown[] = [];
    const carousel: Behavior<'carousel'> = {
      name: 'carousel',
      attach: () => ({ save: () => ({ slide: 2 }), restore: (state) => void restored.push(state) }),
    };
    const { part, box } = withApi({ list: [carousel] });
    const html = '<div data-behavior="carousel"></div>';
    const first = placeSection('shop:slides', 's1', html);
    started = start({ parts: [part], sections: [] });
    const state = box.api?.save('s1') ?? null;
    expect(state).not.toBeNull();
    expect(box.api?.save('нет-такой')).toBeNull();
    first.remove();
    await tick();
    expect(box.api?.save('s1')).toBeNull();
    placeSection('shop:slides', 's1', html);
    await tick();
    box.api?.restore('s1', state);
    expect(restored).toEqual([{ slide: 2 }]);
  });

  it('превью и «уменьшить движение» — в настройках движения; animate — провайдер из опций или null', () => {
    document.head.innerHTML = configTag('preview');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }),
    });
    const quantity = spy('quantity');
    const provider: AnimateProvider = () => ({ finished: Promise.resolve(), stop: () => undefined });
    const { part, box } = withApi({ list: [quantity.behavior], animate: provider });
    placeSection('shop:a', 'a', '<div data-behavior="quantity"></div>');
    started = start({ parts: [part], sections: [] });
    expect(quantity.hosts[0]?.motion).toEqual({ reduced: true, preview: true });
    expect(box.api?.animate).toBe(provider);
    const core: CoreHandle = {
      config: null,
      mode: 'live',
      emit: () => undefined,
      part: () => {
        throw new Error('нет частей');
      },
    };
    expect(behaviors({ list: [] }).create(core).animate).toBeNull();
  });
});
