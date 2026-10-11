import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection, type SectionContext } from '../src/define';
import { REPLACE_LIMIT, SECTION_UPDATED, UPDATE_SECTION } from '../src/preview';
import { STATE_ATTRIBUTE } from '../src/registry';
import { startShell, type Shell } from '../src/start';
import { sectionElement, watchFailures } from './support';

// Превью в jsdom: страница не в рамке, window.parent === window. Сообщения конструктора — MessageEvent с source: window,
// ответы ядра ловит шпион на window.postMessage.
const HOST = 'https://customize.merfy.ru';
const NAME = 'shop:color-match';
const HTML = '<button type="button">+1</button><p></p>';

const config = (mode: string) => ({
  v: 1,
  mode,
  shop: { id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70', name: 'Шарфы', url: 'https://scarves.example' },
  currency: 'RUB',
  locale: 'ru-RU',
  api: { url: 'https://gateway.dev.merfy.ru/api' },
  theme: { id: 'nova', version: '0.0.4' },
  page: { id: 'home', path: '/' },
});
const tag = (id: string, value: unknown): string =>
  `<script type="application/json" id="${id}">${JSON.stringify(value)}</script>`;
const headOf = (mode: string): string =>
  tag('merfy-config', config(mode)) +
  tag('merfy-modules', { v: 1, modules: [{ kind: 'section', name: NAME, src: '/m/v1.js' }] });

// Версия секции: считает нажатия; счёт отдаёт новой версии (saveState) и берёт у прошлой (context.state).
function counter(label: string) {
  const counts = new WeakMap<HTMLElement, number>();
  const show = (element: HTMLElement, count: number): void => {
    counts.set(element, count);
    element.querySelector('p')?.replaceChildren(`${label}: ${count}`);
  };
  const mount = (element: HTMLElement, context: SectionContext): void => {
    show(element, typeof context.state === 'number' ? context.state : 0);
    element.querySelector('button')?.addEventListener('click', () => show(element, (counts.get(element) ?? 0) + 1));
  };
  return { default: defineSection({ mount, saveState: (element) => counts.get(element) }) };
}

const MODULES: Record<string, unknown> = {
  '/m/v1.js': counter('v1'),
  '/m/v2.js': counter('v2'),
  '/m/slow.js': counter('slow'),
  // Не принимает состояние прошлой версии: с ним падает, с нуля — запускается.
  '/m/picky.js': {
    default: defineSection({
      mount: (element, context) => {
        if (context.state !== undefined) throw new Error('состояние v1 не подходит');
        element.querySelector('p')?.replaceChildren('picky: 0');
      },
    }),
  },
  '/m/crash.js': {
    default: defineSection({
      mount: () => {
        throw new Error('v3 сломалась при запуске');
      },
    }),
  },
  '/m/empty.js': { notDefault: true },
};

// «Сервер» модулей: адрес → модуль, адреса нет — ошибка сети; /m/slow.js отдаётся, когда тест вызовет open().
function moduleServer() {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const importModule = vi.fn(async (src: string): Promise<unknown> => {
    if (src === '/m/slow.js') await gate;
    if (Object.hasOwn(MODULES, src)) return MODULES[src];
    throw new TypeError(`Failed to fetch ${src}`);
  });
  return { importModule, open: () => open() };
}

const update = (src: string | null, html = HTML) => ({ type: UPDATE_SECTION, name: NAME, html, src });
const answer = (outcome: string, message: unknown = null, name = NAME) => ({
  type: SECTION_UPDATED,
  name,
  outcome,
  message,
});
const send = (data: unknown, source: MessageEventSource | null = window): void => {
  window.dispatchEvent(new MessageEvent('message', { data, source, origin: HOST }));
};
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));
const spyPost = () => vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
const reload = vi.fn<() => void>();

let watch: ReturnType<typeof watchFailures>;
let post: ReturnType<typeof spyPost>;
let shell: Shell | undefined;

beforeEach(() => {
  watch = watchFailures();
  post = spyPost();
  reload.mockClear();
});

afterEach(() => {
  shell?.stop();
  shell = undefined;
  post.mockRestore();
  watch.stop();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

// Ядро в нужном режиме и живая секция с кодом v1. Секция — после startShell (задача 2: элемент регистрируется один раз).
async function startPage(mode = 'preview') {
  document.head.innerHTML = headOf(mode);
  const server = moduleServer();
  shell = startShell({ window, importModule: server.importModule, reload });
  const element = sectionElement(NAME, HTML);
  await shell.ready;
  const text = (): string | null | undefined => element.querySelector('p')?.textContent;
  const click = (): void => element.querySelector('button')?.click();
  return { element, server, text, click };
}

// Ответы ядра по порядку — когда их ровно count.
async function answers(count: number): Promise<unknown[]> {
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(count));
  return post.mock.calls.map((call): unknown => call[0]);
}

describe('правка в превью на лету', () => {
  it('новая версия — с состоянием старой и новым HTML (kept-state); ответ — только источнику', async () => {
    const page = await startPage();
    page.click();
    page.click();
    expect(page.text()).toBe('v1: 2');
    send(update('/m/v2.js', `<h2>Подбор цвета</h2>${HTML}`));
    expect(await answers(1)).toEqual([answer('kept-state')]);
    expect(post).toHaveBeenCalledWith(answer('kept-state'), HOST);
    expect(page.text()).toBe('v2: 2');
    expect(page.element.querySelector('h2')?.textContent).toBe('Подбор цвета');
    expect(page.element.getAttribute(STATE_ATTRIBUTE)).toBe('mounted');
    page.click();
    expect(page.text()).toBe('v2: 3');
  });

  it('с состоянием не запустилась — ещё раз с нуля (fresh); не запустилась и так — failed, секция «не ожила»', async () => {
    const page = await startPage();
    page.click();
    send(update('/m/picky.js'));
    expect(await answers(1)).toEqual([answer('fresh')]);
    expect(page.text()).toBe('picky: 0');
    send(update('/m/crash.js'));
    expect((await answers(2))[1]).toEqual(answer('failed', 'v3 сломалась при запуске'));
    expect(page.element.getAttribute(STATE_ATTRIBUTE)).toBe('failed');
    expect(page.element.hasAttribute('inert')).toBe(true);
    expect(watch.failures).toEqual([
      { section: NAME, src: '/m/crash.js', stage: 'mount', message: 'v3 сломалась при запуске' },
    ]);
  });

  it('модуль не загрузился и после повтора — reloaded и перезагрузка; нет определения — failed; старый код живой', async () => {
    const page = await startPage();
    send(update('/m/missing.js'));
    expect(await answers(1)).toEqual([answer('reloaded', expect.stringContaining('/m/missing.js?merfy-retry=1'))]);
    expect(reload).toHaveBeenCalledTimes(1);
    send(update('/m/empty.js'));
    expect((await answers(2))[1]).toEqual(answer('failed', '/m/empty.js: нет export default defineSection({ mount })'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(page.element.getAttribute(STATE_ATTRIBUTE)).toBe('mounted');
    page.click();
    expect(page.text()).toBe('v1: 1');
  });

  it('пока грузился модуль, пришла правка новее — старая не применяется (superseded); секции нет — absent', async () => {
    const page = await startPage();
    send(update('/m/slow.js'));
    send(update('/m/v2.js'));
    expect(await answers(1)).toEqual([answer('kept-state')]);
    page.server.open();
    expect(await answers(2)).toEqual([answer('kept-state'), answer('superseded')]);
    expect(page.text()).toBe('v2: 0');
    send({ ...update('/m/v2.js'), name: 'shop:nowhere' });
    expect((await answers(3))[2]).toEqual(answer('absent', null, 'shop:nowhere'));
  });

  it(`замена номер ${REPLACE_LIMIT} — reloaded: превью перезагружается, а не копит модули в памяти`, async () => {
    const page = await startPage();
    for (let count = 1; count < REPLACE_LIMIT; count += 1) {
      send(update(count % 2 === 0 ? '/m/v1.js' : '/m/v2.js'));
      await answers(count);
    }
    send(update('/m/v1.js'));
    const all = await answers(REPLACE_LIMIT);
    expect(all.slice(0, -1)).toEqual(Array.from({ length: REPLACE_LIMIT - 1 }, () => answer('kept-state')));
    expect(all[REPLACE_LIMIT - 1]).toEqual(
      answer('reloaded', `${REPLACE_LIMIT} замен кода без перезагрузки — превью перезагружается`),
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(page.text()).toBe('v2: 0');
  });

  it('на витрине (mode live) ядро сообщения превью не слушает', async () => {
    const page = await startPage('live');
    send(update('/m/v2.js'));
    await tick();
    expect(post).not.toHaveBeenCalled();
    expect(page.server.importModule).toHaveBeenCalledTimes(1);
    expect(page.text()).toBe('v1: 0');
  });

  it('чужие сообщения не трогает: не от родителя, не update-section, битое имя, адрес или HTML, не объект', async () => {
    const page = await startPage();
    send(update('/m/v2.js'), null);
    send({ ...update('/m/v2.js'), type: 'update-tokens' });
    send({ ...update('/m/v2.js'), name: 'color-match' });
    send(update('m/v2.js'));
    send({ ...update('/m/v2.js'), html: 42 });
    send('update-section');
    await tick();
    expect(post).not.toHaveBeenCalled();
    expect(page.server.importModule).toHaveBeenCalledTimes(1);
    expect(page.text()).toBe('v1: 0');
  });
});
