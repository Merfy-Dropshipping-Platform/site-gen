import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/define';
import { STATE_ATTRIBUTE } from '../src/registry';
import { PAGE_LOAD_EVENT, SHELL_ERROR_ATTRIBUTE, reportConfig, startShell, type Shell } from '../src/start';
import { sectionElement, watchFailures } from './support';

// Конфиг витрины v1 (блок 3) — то, что сборка пишет в <head>.
const CONFIG = {
  v: 1,
  mode: 'live',
  shop: { id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70', name: 'Шарфы', url: 'https://scarves.example' },
  currency: 'RUB',
  locale: 'ru-RU',
  api: { url: 'https://gateway.dev.merfy.ru/api' },
  theme: { id: 'nova', version: '0.0.4' },
  page: { id: 'home', path: '/' },
};
const SCARF = { kind: 'section', name: 'nova:scarf-colors', src: '/m/scarf.js' };
const REVIEWS = { kind: 'section', name: 'reviews:list', src: '/m/reviews.js' };
const GEO = { kind: 'global', name: 'geo:locate', src: '/m/geo.js' };

const tag = (id: string, text: string): string => `<script type="application/json" id="${id}">${text}</script>`;
const modulesTag = (modules: unknown[]): string => tag('merfy-modules', JSON.stringify({ v: 1, modules }));
const configTag = tag('merfy-config', JSON.stringify(CONFIG));
const sectionModule = () => Promise.resolve({ default: defineSection({ mount: () => undefined }) });

let watch: ReturnType<typeof watchFailures>;
let shell: Shell | undefined;

beforeEach(() => {
  watch = watchFailures();
});

afterEach(() => {
  shell?.stop();
  shell = undefined;
  watch.stop();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('запуск ядра', () => {
  it('конфиг прочитан, секции страницы ожили, ready — после загрузки модулей', async () => {
    document.head.innerHTML = configTag + modulesTag([SCARF]);
    const importModule = vi.fn<(src: string) => Promise<unknown>>(sectionModule);
    shell = startShell({ window, importModule });
    const element = sectionElement('nova:scarf-colors');
    await shell.ready;
    expect(shell.config?.shop.name).toBe('Шарфы');
    expect(element.getAttribute(STATE_ATTRIBUTE)).toBe('mounted');
    expect(importModule.mock.calls).toEqual([['/m/scarf.js']]);
  });

  it('нет конфига (п. 5): console.error, на витрине плашки нет, секции всё равно оживают', async () => {
    document.head.innerHTML = modulesTag([SCARF]);
    shell = startShell({ window, importModule: sectionModule });
    const element = sectionElement('nova:scarf-colors');
    await shell.ready;
    expect(shell.config).toBeNull();
    expect(watch.consoleError).toHaveBeenCalledWith('Конфиг витрины не прочитан: на странице нет тега #merfy-config');
    expect(document.querySelector(`[${SHELL_ERROR_ATTRIBUTE}]`)).toBeNull();
    expect(element.getAttribute(STATE_ATTRIBUTE)).toBe('mounted');
  });

  it('превью в рамке конструктора — плашка role=alert с текстом ошибки конфига', () => {
    reportConfig({ parent: window, document }, new Error('v: читатель знает только версию 1'));
    const alert = document.querySelector(`[${SHELL_ERROR_ATTRIBUTE}]`);
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toBe('Конфиг витрины не прочитан: v: читатель знает только версию 1');
  });

  it('битый список модулей — console.error с номером строки, модули не грузятся', async () => {
    document.head.innerHTML = configTag + tag('merfy-modules', '{"v":1,"modules":[{"kind":"island"}]}');
    const importModule = vi.fn<(src: string) => Promise<unknown>>(sectionModule);
    shell = startShell({ window, importModule });
    await shell.ready;
    expect(importModule).not.toHaveBeenCalled();
    expect(watch.consoleError).toHaveBeenCalledWith(
      'Список модулей страницы не прочитан: #merfy-modules.modules.0: строке нужны kind (section или global), name с приставкой и src',
    );
  });

  it('astro:page-load — список новой страницы, загруженное не качается заново; после stop событие не слушается', async () => {
    document.head.innerHTML = configTag + modulesTag([SCARF]);
    const importModule = vi.fn<(src: string) => Promise<unknown>>(sectionModule);
    shell = startShell({ window, importModule });
    await shell.ready;
    document.head.innerHTML = configTag + modulesTag([SCARF, REVIEWS]);
    document.dispatchEvent(new Event(PAGE_LOAD_EVENT));
    await vi.waitFor(() => expect(importModule).toHaveBeenCalledTimes(2));
    expect(importModule.mock.calls).toEqual([['/m/scarf.js'], ['/m/reviews.js']]);
    shell.stop();
    document.head.innerHTML = configTag + modulesTag([GEO]);
    document.dispatchEvent(new Event(PAGE_LOAD_EVENT));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(importModule).toHaveBeenCalledTimes(2);
  });
});
