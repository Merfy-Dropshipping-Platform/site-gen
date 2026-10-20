import { sha256 } from '@merfy/storefront-build';
import type { SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { EXTENSIONS_QUEUE, codeOf, enabledExtensions } from '../src/code';
import type { LogFields } from '../src/log';

// Код магазина из строк реестра и ответ сервиса extensions — без базы и брокера.
const SHELL = { version: '0.1.0', hash: sha256('ядро'), preload: ['shell.js'], files: [] };
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';

// Строка реестра блока 7: секция или глобальный скрипт; script — текст готового модуля или null.
function row(name: string, kind: SectionRow['kind'], script: string | null): SectionRow {
  const [owner = '', id = ''] = name.split(':');
  return {
    id: name,
    name,
    kind,
    author: 'theme',
    owner,
    release: '0.0.1',
    sourceHash: sha256(`исходник ${name}`),
    contentHash: sha256(`правка ${name}`),
    manifest: { v: 1, name: id, kind, title: name, fields: [] },
    template: `<p>${name}</p>`,
    style: '',
    render: kind === 'section' ? `export default {}; // модуль ${name}` : null,
    renderHash: kind === 'section' ? sha256(`модуль ${name}`) : null,
    script,
    scriptHash: script === null ? null : sha256(script),
    warnings: [],
    draft: false,
    published: false,
    createdAt: '2026-10-10T09:00:00.000Z',
  };
}

const GEO = row('geo:locate', 'global', 'export default {}; // город');
const SCARF = row('nova:scarf-colors', 'section', null);
const BADGE = row('platform:cart-badge', 'section', 'export default {}; // значок');

describe('codeOf', () => {
  it('места — только видимые секции; глобальные — все; скрипты — по отпечатку; ядро — раз есть скрипт', () => {
    const placement = { home: ['platform:cart-badge', 'reviews:list', 'nova:scarf-colors', 'geo:locate'], about: [] };
    const shop = codeOf([GEO, SCARF, BADGE], placement, SHELL);
    expect(shop.code.pages).toEqual({ home: ['platform:cart-badge', 'nova:scarf-colors'], about: [] });
    expect(shop.code.globals).toEqual(['geo:locate']);
    expect(shop.code.sections.map((section) => [section.name, section.hash, section.html, section.script])).toEqual(
      [GEO, SCARF, BADGE].map((source) => [source.name, source.contentHash, source.template, source.scriptHash]),
    );
    expect([...shop.assets.modules.keys()]).toEqual([GEO.scriptHash, BADGE.scriptHash]);
    expect(shop.shell).toEqual({ version: '0.1.0', hash: SHELL.hash, preload: ['shell.js'] });
  });

  it('секция не стоит ни на одной странице — её нет в коде; скриптов нет — ядра нет', () => {
    const shop = codeOf([SCARF, BADGE], { home: ['nova:scarf-colors'] }, SHELL);
    expect(shop.code.sections.map((section) => section.name)).toEqual(['nova:scarf-colors']);
    expect(shop.shell).toBeNull();
    expect(shop.assets.modules.size).toBe(0);
  });
});

describe('enabledExtensions', () => {
  const calls: unknown[][] = [];
  const lines: string[] = [];
  const log = (message: string, fields?: LogFields): void => void lines.push(`${message}: ${String(fields?.error)}`);
  const request = (answer: () => Promise<unknown>) => ({
    call: (...args: unknown[]): Promise<unknown> => {
      calls.push(args);
      return answer();
    },
    timeoutMs: 1_500,
    log,
  });

  it('запрос — в extensions_queue с id магазина; ответ — id и версии расширений', async () => {
    const answer = { success: true, data: [{ id: 'reviews', version: '1.4.0', admin: {}, hooks: [] }] };
    expect(
      await enabledExtensions(
        request(() => Promise.resolve(answer)),
        SHOP,
      ),
    ).toEqual([{ id: 'reviews', version: '1.4.0' }]);
    expect(calls).toEqual([[EXTENSIONS_QUEUE, 'extensions.enabledForShop', { shopId: SHOP }, 1_500]]);
  });

  it('неуспех или ошибка — null и строка журнала extensions-failed', async () => {
    const failed = { success: false, code: 'NOT_FOUND', message: 'нет магазина' };
    expect(
      await enabledExtensions(
        request(() => Promise.resolve(failed)),
        SHOP,
      ),
    ).toBeNull();
    expect(
      await enabledExtensions(
        request(() => Promise.reject(new Error('тайм-аут 1500 мс'))),
        SHOP,
      ),
    ).toBeNull();
    expect(lines).toEqual([
      'extensions-failed: extensions.enabledForShop: success = false',
      'extensions-failed: тайм-аут 1500 мс',
    ]);
  });
});
