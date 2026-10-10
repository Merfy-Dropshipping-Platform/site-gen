import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/define';
import { STATE_ATTRIBUTE, createRegistry } from '../src/registry';
import { sectionElement, watchFailures } from './support';

let watch: ReturnType<typeof watchFailures>;

beforeEach(() => {
  watch = watchFailures();
});

afterEach(() => {
  watch.stop();
  document.body.replaceChildren();
});

const stateOf = (element: HTMLElement): string | null => element.getAttribute(STATE_ATTRIBUTE);
const quiet = defineSection({ mount: () => undefined });

describe('реестр секций: запуск', () => {
  it('элемент раньше модуля — запуск, когда пришло определение; имя — из атрибута', async () => {
    const registry = createRegistry(window);
    const element = sectionElement('nova:scarf-colors');
    const mount = vi.fn();
    await registry.connect(element);
    expect(stateOf(element)).toBeNull();
    await registry.define('nova:scarf-colors', defineSection({ mount }), '/_merfy/m/aa.js');
    expect(mount).toHaveBeenCalledWith(element, { name: 'nova:scarf-colors', state: undefined });
    expect(stateOf(element)).toBe('mounted');
    expect(registry.has('nova:scarf-colors')).toBe(true);
  });

  it('модуль раньше элемента — элемент запускается сразу', async () => {
    const registry = createRegistry(window);
    const mount = vi.fn();
    await registry.define('platform:cart-badge', defineSection({ mount }), '/_merfy/m/bb.js');
    const element = sectionElement('platform:cart-badge');
    await registry.connect(element);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(stateOf(element)).toBe('mounted');
  });

  it('секция без скрипта (п. 16) — элемент без состояния, реестр её не знает', async () => {
    const registry = createRegistry(window);
    const element = sectionElement('shop:text');
    await registry.connect(element);
    expect(stateOf(element)).toBeNull();
    expect(registry.has('shop:text')).toBe(false);
  });
});

describe('реестр секций: предохранитель (С7-16 А)', () => {
  it('mount бросил — «не ожила»: failed, inert, запись автору; соседняя секция живая', async () => {
    const registry = createRegistry(window);
    const broken = sectionElement('shop:broken');
    const neighbor = sectionElement('reviews:list');
    const failing = defineSection({
      mount: () => {
        throw new Error('сломалась при запуске');
      },
    });
    await registry.define('shop:broken', failing, '/_merfy/m/cc.js');
    await registry.define('reviews:list', quiet, '/_merfy/m/dd.js');
    await registry.connect(broken);
    await registry.connect(neighbor);
    expect(stateOf(broken)).toBe('failed');
    expect(broken.hasAttribute('inert')).toBe(true);
    expect(stateOf(neighbor)).toBe('mounted');
    expect(neighbor.hasAttribute('inert')).toBe(false);
    expect(watch.failures).toEqual([
      { section: 'shop:broken', src: '/_merfy/m/cc.js', stage: 'mount', message: 'сломалась при запуске' },
    ]);
    expect(watch.consoleError).toHaveBeenCalledWith('Секция shop:broken не ожила (mount): сломалась при запуске');
  });

  it('асинхронный mount отклонён — тоже «не ожила»', async () => {
    const registry = createRegistry(window);
    const element = sectionElement('shop:late');
    await registry.connect(element);
    await registry.define('shop:late', defineSection({ mount: () => Promise.reject(new Error('позже')) }), '/m/l.js');
    expect(stateOf(element)).toBe('failed');
    expect(watch.failures).toEqual([{ section: 'shop:late', src: '/m/l.js', stage: 'mount', message: 'позже' }]);
  });

  it('ушла со страницы — unmount и без состояния; не запущенную не снимаем', async () => {
    const registry = createRegistry(window);
    const unmount = vi.fn();
    const element = sectionElement('nova:gallery');
    await registry.define('nova:gallery', defineSection({ mount: () => undefined, unmount }), '/m/g.js');
    await registry.connect(element);
    await registry.disconnect(element);
    expect(unmount).toHaveBeenCalledWith(element);
    expect(stateOf(element)).toBeNull();
    await registry.disconnect(element);
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it('unmount бросил — запись unmount, наружу исключения нет', async () => {
    const registry = createRegistry(window);
    const element = sectionElement('nova:sticky');
    const sticky = defineSection({
      mount: () => undefined,
      unmount: () => {
        throw new Error('не снимается');
      },
    });
    await registry.define('nova:sticky', sticky, '/m/s.js');
    await registry.connect(element);
    await expect(registry.disconnect(element)).resolves.toBeUndefined();
    expect(watch.failures).toEqual([
      { section: 'nova:sticky', src: '/m/s.js', stage: 'unmount', message: 'не снимается' },
    ]);
  });

  it('fail — все элементы секции «не ожила», и те, что появятся позже; запись одна', async () => {
    const registry = createRegistry(window);
    const first = sectionElement('reviews:photos');
    await registry.connect(first);
    registry.fail('reviews:photos', 'load', new Error('503'), '/m/p.js');
    registry.fail('reviews:photos', 'runtime', new Error('снова'));
    const second = sectionElement('reviews:photos');
    await registry.connect(second);
    expect([stateOf(first), stateOf(second)]).toEqual(['failed', 'failed']);
    expect(watch.failures).toEqual([{ section: 'reviews:photos', src: '/m/p.js', stage: 'load', message: '503' }]);
  });

  it('определение пришло после сбоя — отметка снята, элементы ожили', async () => {
    const registry = createRegistry(window);
    const element = sectionElement('reviews:photos');
    await registry.connect(element);
    registry.fail('reviews:photos', 'load', new Error('503'), '/m/p.js');
    await registry.define('reviews:photos', quiet, '/m/p.js?merfy-retry=1');
    expect(stateOf(element)).toBe('mounted');
    expect(element.hasAttribute('inert')).toBe(false);
  });
});

describe('реестр секций: шаги для превью (С7-22 В)', () => {
  it('состояние живой секции, снятие, новое определение без запуска, запуск с состоянием', async () => {
    const registry = createRegistry(window);
    const mount = vi.fn();
    const element = sectionElement('shop:counter');
    await registry.define('shop:counter', defineSection({ mount, saveState: () => ({ count: 2 }) }), '/m/v1.js');
    await registry.connect(element);
    expect(registry.saveState(element)).toEqual({ count: 2 });
    await registry.stop(element);
    expect(stateOf(element)).toBeNull();
    expect(registry.saveState(element)).toBeUndefined();
    registry.adopt('shop:counter', defineSection({ mount }), '/m/v2.js');
    expect(stateOf(element)).toBeNull();
    expect(await registry.tryStart(element, { count: 2 })).toEqual({ ok: true });
    expect(mount).toHaveBeenLastCalledWith(element, { name: 'shop:counter', state: { count: 2 } });
    expect(stateOf(element)).toBe('mounted');
    expect(registry.elementsOf('shop:counter')).toEqual([element]);
  });

  it('сбой saveState — undefined; неудачный tryStart не помечает; failElement помечает и пишет', async () => {
    const registry = createRegistry(window);
    const element = sectionElement('shop:counter');
    const saveState = (): unknown => {
      throw new Error('нечего отдать');
    };
    await registry.define('shop:counter', defineSection({ mount: () => undefined, saveState }), '/m/v1.js');
    await registry.connect(element);
    expect(registry.saveState(element)).toBeUndefined();
    await registry.stop(element);
    const error = new Error('не принял');
    registry.adopt('shop:counter', defineSection({ mount: () => Promise.reject(error) }), '/m/v2.js');
    expect(await registry.tryStart(element, { count: 1 })).toEqual({ ok: false, error });
    expect(stateOf(element)).toBeNull();
    registry.failElement(element, 'mount', error);
    expect(stateOf(element)).toBe('failed');
    expect(watch.failures).toEqual([
      { section: 'shop:counter', src: '/m/v2.js', stage: 'mount', message: 'не принял' },
    ]);
    registry.adopt('shop:counter', null, null);
    expect(registry.has('shop:counter')).toBe(false);
  });
});
