import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineSection } from '../src/define';
import { STATE_ATTRIBUTE, createRegistry } from '../src/registry';
import { sourceIndex, watchErrors } from '../src/sources';
import { sectionElement, watchFailures } from './support';

let watch: ReturnType<typeof watchFailures>;
let controller: AbortController;

beforeEach(() => {
  watch = watchFailures();
  controller = new AbortController();
});

afterEach(() => {
  controller.abort();
  watch.stop();
  document.body.replaceChildren();
});

// Две живые секции страницы и слушатель ошибок ядра.
async function livePage() {
  const registry = createRegistry(window);
  const sources = sourceIndex(document.baseURI);
  watchErrors(window, sources, registry, controller.signal);
  sources.add('/m/clicky.js', 'shop:clicky');
  sources.add('/m/quiet.js', 'reviews:list');
  await registry.define('shop:clicky', defineSection({ mount: () => undefined }), '/m/clicky.js');
  await registry.define('reviews:list', defineSection({ mount: () => undefined }), '/m/quiet.js');
  const clicky = sectionElement('shop:clicky');
  const quiet = sectionElement('reviews:list');
  await registry.connect(clicky);
  await registry.connect(quiet);
  return { clicky, quiet };
}

const stateOf = (element: HTMLElement): string | null => element.getAttribute(STATE_ATTRIBUTE);

describe('чей сбой', () => {
  it('файл и стек ведут к имени секции, query не мешает; чужой файл — ничей', () => {
    const sources = sourceIndex('https://shop.example/products/sharf/');
    sources.add('/_merfy/m/aa.js', 'nova:scarf-colors');
    expect(sources.nameOfFile('https://shop.example/_merfy/m/aa.js?merfy-retry=1')).toBe('nova:scarf-colors');
    const stack = 'Error: x\n    at onClick (https://shop.example/_merfy/m/aa.js?merfy-retry=1:1:204)';
    expect(sources.nameInStack(stack)).toBe('nova:scarf-colors');
    expect(sources.nameOfFile('https://shop.example/_astro/theme.js')).toBeUndefined();
    expect(sources.nameInStack('')).toBeUndefined();
  });

  it('ошибка в обработчике секции — «не ожила» (runtime), соседняя живая; чужая ошибка — без записи', async () => {
    const { clicky, quiet } = await livePage();
    const foreign = { filename: `${location.origin}/_astro/theme.js`, error: new Error('чужая') };
    window.dispatchEvent(new ErrorEvent('error', foreign));
    window.dispatchEvent(
      new ErrorEvent('error', { filename: `${location.origin}/m/clicky.js`, error: new Error('клик сломался') }),
    );
    expect([stateOf(clicky), stateOf(quiet)]).toEqual(['failed', 'mounted']);
    expect(watch.failures).toEqual([
      { section: 'shop:clicky', src: '/m/clicky.js', stage: 'runtime', message: 'клик сломался' },
    ]);
  });

  it('отклонённое обещание секции — виновник по стеку', async () => {
    const { clicky, quiet } = await livePage();
    const error = new Error('обещание секции');
    error.stack = `Error: обещание секции\n    at tick (${location.origin}/m/quiet.js?merfy-retry=1:1:10)`;
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: error }));
    expect([stateOf(clicky), stateOf(quiet)]).toEqual(['mounted', 'failed']);
    expect(watch.failures).toEqual([
      { section: 'reviews:list', src: '/m/quiet.js', stage: 'runtime', message: 'обещание секции' },
    ]);
  });
});
