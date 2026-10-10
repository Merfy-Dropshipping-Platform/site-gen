import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/define';
import { useSectionElement } from '../src/element';
import { ShellError } from '../src/errors';
import {
  GLOBAL_ATTRIBUTE,
  RETRY_PARAM,
  definitionOf,
  importWithRetry,
  loadPage,
  retryUrl,
  type LoaderDeps,
} from '../src/loader';
import type { ModuleEntry } from '../src/modules';
import { STATE_ATTRIBUTE, createRegistry, type SectionRegistry } from '../src/registry';
import { sectionElement, watchFailures } from './support';

let watch: ReturnType<typeof watchFailures>;

beforeEach(() => {
  watch = watchFailures();
});

afterEach(() => {
  watch.stop();
  document.body.replaceChildren();
});

// «Сервер» модулей: адрес → модуль; адреса нет — ошибка сети. Каждый запрос — в журнал.
function server(modules: Record<string, unknown>) {
  const requests: string[] = [];
  const importModule = (src: string): Promise<unknown> => {
    requests.push(src);
    if (Object.hasOwn(modules, src)) return Promise.resolve(modules[src]);
    return Promise.reject(new TypeError(`Failed to fetch ${src}`));
  };
  return { requests, importModule };
}

// Загрузчик с реестром, к которому подключён элемент <merfy-section>, — как в ядре.
function loaderOf(registry: SectionRegistry, importModule: (src: string) => Promise<unknown>): LoaderDeps {
  useSectionElement(window.customElements, {
    connect: (element) => void registry.connect(element),
    disconnect: (element) => void registry.disconnect(element),
  });
  return { registry, importModule, document, started: new Set<string>(), remember: () => undefined };
}

const sectionModule = (mount: () => void = () => undefined) => ({ default: defineSection({ mount }) });
const stateOf = (element: Element | null | undefined): string | null | undefined =>
  element?.getAttribute(STATE_ATTRIBUTE);

describe('загрузка модуля', () => {
  it('адрес повтора — тот же файл с ?merfy-retry=1, прежний query на месте', () => {
    expect(retryUrl('/_merfy/m/aa.js?v=2', 'https://shop.example/catalog/')).toBe(
      `https://shop.example/_merfy/m/aa.js?v=2&${RETRY_PARAM}=1`,
    );
  });

  it('сеть подвела — одна повторная попытка с другим адресом; вторая неудача — ошибка наружу', async () => {
    const flaky = vi
      .fn<(src: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ default: 1 });
    await expect(importWithRetry(flaky, '/m/a.js', 'https://shop.example/')).resolves.toEqual({ default: 1 });
    expect(flaky.mock.calls).toEqual([['/m/a.js'], ['https://shop.example/m/a.js?merfy-retry=1']]);
    const down = vi.fn<(src: string) => Promise<unknown>>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(importWithRetry(down, '/m/b.js', 'https://shop.example/')).rejects.toThrow('Failed to fetch');
    expect(down).toHaveBeenCalledTimes(2);
  });

  it('определение — export default модуля; без него — section-invalid с адресом файла', () => {
    const module = sectionModule();
    expect(definitionOf(module, '/m/a.js')).toBe(module.default);
    expect(() => definitionOf({ mount: () => undefined }, '/m/b.js')).toThrow(
      '/m/b.js: нет export default defineSection({ mount })',
    );
    expect(() => definitionOf(undefined, '/m/c.js')).toThrow(ShellError);
  });
});

describe('модули страницы', () => {
  it('все сразу: запросы ушли до первого ответа; каждая секция ожила на своих элементах', async () => {
    const registry = createRegistry(window);
    const { requests, importModule } = server({ '/m/scarf.js': sectionModule(), '/m/badge.js': sectionModule() });
    const deps = loaderOf(registry, importModule);
    const scarf = sectionElement('nova:scarf-colors');
    const badges = [sectionElement('platform:cart-badge'), sectionElement('platform:cart-badge')];
    const loading = loadPage(deps, [
      { kind: 'section', name: 'nova:scarf-colors', src: '/m/scarf.js' },
      { kind: 'section', name: 'platform:cart-badge', src: '/m/badge.js' },
    ]);
    expect(requests).toEqual(['/m/scarf.js', '/m/badge.js']);
    await loading;
    expect([scarf, ...badges].map(stateOf)).toEqual(['mounted', 'mounted', 'mounted']);
  });

  it('не загрузился и после повтора — load; нет export default — define; соседняя секция живая', async () => {
    const registry = createRegistry(window);
    const { requests, importModule } = server({
      '/m/odd.js': { mount: () => undefined },
      '/m/badge.js': sectionModule(),
    });
    const deps = loaderOf(registry, importModule);
    const elements = [
      sectionElement('reviews:list'),
      sectionElement('shop:odd'),
      sectionElement('platform:cart-badge'),
    ];
    await loadPage(deps, [
      { kind: 'section', name: 'reviews:list', src: '/m/reviews.js' },
      { kind: 'section', name: 'shop:odd', src: '/m/odd.js' },
      { kind: 'section', name: 'platform:cart-badge', src: '/m/badge.js' },
    ]);
    const retry = `${location.origin}/m/reviews.js?merfy-retry=1`;
    expect(requests.filter((src) => src.includes('reviews'))).toEqual(['/m/reviews.js', retry]);
    expect(elements.map(stateOf)).toEqual(['failed', 'failed', 'mounted']);
    expect(watch.failures).toHaveLength(2);
    expect(watch.failures).toEqual(
      expect.arrayContaining([
        { section: 'reviews:list', src: '/m/reviews.js', stage: 'load', message: `Failed to fetch ${retry}` },
        {
          section: 'shop:odd',
          src: '/m/odd.js',
          stage: 'define',
          message: '/m/odd.js: нет export default defineSection({ mount })',
        },
      ]),
    );
  });

  it('глобальный скрипт — скрытый элемент в конце <body>; модуль качается один раз; после смены страницы — снова', async () => {
    const registry = createRegistry(window);
    const mount = vi.fn();
    const { requests, importModule } = server({ '/m/geo.js': sectionModule(mount) });
    const deps = loaderOf(registry, importModule);
    const entries: ModuleEntry[] = [{ kind: 'global', name: 'geo:locate', src: '/m/geo.js' }];
    await loadPage(deps, entries);
    expect(document.body.lastElementChild?.outerHTML).toBe(
      '<merfy-section data-section="geo:locate" data-merfy-global="" hidden="" data-merfy-state="mounted"></merfy-section>',
    );
    await loadPage(deps, entries);
    expect(document.querySelectorAll(`[${GLOBAL_ATTRIBUTE}]`)).toHaveLength(1);
    document.body.replaceChildren();
    await loadPage(deps, entries);
    await vi.waitFor(() => expect(stateOf(document.body.lastElementChild)).toBe('mounted'));
    expect(requests).toEqual(['/m/geo.js']);
    expect(mount).toHaveBeenCalledTimes(2);
  });
});
