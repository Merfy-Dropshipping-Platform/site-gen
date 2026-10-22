/**
 * Задача 5.4 спеки 120 на vanilla (по образцу flux, тот же диф): записи
 * расширений в «Моих заказах» и страница записи, вход по ссылке письма ведёт
 * по `next`, страницы и ссылка «Мои заявки» первой версии убраны. Этап 5 на
 * vanilla: список записей и страница записи — в режиме «как тема»
 * (data-look='theme'): цвета и скругления из токенов vanilla, строки записей
 * не отличаются от строк заказов рядом.
 *
 * Секция «Заказы» проверяется по тому, что реально уезжает на витрину:
 * скомпилированный модуль секции (dist/theme-sections/vanilla) рендерится
 * Container API. Требует сборки: pnpm build:theme-sections vanilla.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXTENSION_ORDERS_RUNTIME_SOURCE } from '../../../packages/theme-base/runtime/extension-orders.runtime';
import { EXTENSION_ORDERS_STYLES } from '../../../packages/theme-base/runtime/extension-orders.styles';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const VANILLA_PAGES = resolve(SITES_ROOT, 'themes/vanilla/src/pages');
const OTHER_THEMES = ['rose', 'bloom', 'satin'] as const;

const read = (path: string): string => readFileSync(path, 'utf8');

function renderOrdersSection(): string {
  const rows = JSON.parse(
    execFileSync(
      'node',
      [
        RENDERER,
        'vanilla',
        JSON.stringify([
          { block: 'OrdersSection', props: { id: 'OrdersSection-1' } },
        ]),
      ],
      { cwd: SITES_ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string }>;
  expect(rows[0]?.error).toBeUndefined();
  return rows[0]?.html ?? '';
}

describe('vanilla: секция «Заказы» добавляет записи расширений', () => {
  const html = renderOrdersSection();

  it('несёт строку рантайма и её стили', () => {
    expect(html).toContain(EXTENSION_ORDERS_RUNTIME_SOURCE.slice(0, 2000));
    expect(html).toContain(EXTENSION_ORDERS_STYLES.slice(0, 500));
  });

  it('зовёт mountRows со страницей записи /account/entry и показывает список, если строки пришли', () => {
    expect(html).toContain('window.__merfyExtensionOrders');
    expect(html).toContain('entryPath: '/account/entry'');
    expect(html).toContain('if (count > 0) showList(root);');
  });

  it('контейнер списка — с data-look='theme': строки записей в токенах vanilla', () => {
    expect(html).toContain('id='orders-list'');
    expect(html).toContain('data-look='theme'');
  });

  it('строка заказа несёт дату — по ней записи встают среди заказов', () => {
    expect(html).toContain('row.dataset.date = order.createdAt || '';');
  });
});

describe('vanilla: страница записи без пункта меню', () => {
  const entry = read(resolve(VANILLA_PAGES, 'account/entry.astro'));

  it('рисует запись общим рантаймом в режиме «как тема», «← Мои заказы» ведёт в /account/orders', () => {
    expect(entry).toContain(
      'import { mountRecordEntry } from \'../../../../../packages/theme-base/runtime/extension-orders\';',
    );
    expect(entry).toContain("ordersPath: '/account/orders'");
    expect(entry).toContain('search: window.location.search');
    expect(entry).toContain('set:html={EXTENSION_ORDERS_STYLES}');
    expect(entry).toContain('data-look='theme'');
  });

  it('без сессии покупателя — на вход', () => {
    expect(entry).toContain("if (!getToken()) {\n        navTo('/login');");
  });

  it('в меню кабинета её нет, ссылки «Мои заявки» тоже', () => {
    const index = read(resolve(VANILLA_PAGES, 'account/index.astro'));
    expect(index).toContain('href='/account/orders'');
    expect(index).not.toContain('/account/entry');
    expect(index).not.toContain('/account/requests');
    expect(index).not.toContain('Мои заявки');
  });
});

describe('vanilla: страницы первой версии убраны, у остальных тем — пока на месте', () => {
  it('у vanilla нет account/requests.astro и account/request.astro', () => {
    expect(existsSync(resolve(VANILLA_PAGES, 'account/requests.astro'))).toBe(
      false,
    );
    expect(existsSync(resolve(VANILLA_PAGES, 'account/request.astro'))).toBe(
      false,
    );
  });

  it.each(OTHER_THEMES)('%s хранит requests.astro первой версии', (theme) => {
    expect(
      existsSync(
        resolve(SITES_ROOT, `themes/${theme}/src/pages/account/requests.astro`),
      ),
    ).toBe(true);
  });
});

describe('vanilla: вход по ссылке из письма ведёт по next', () => {
  const verify = read(resolve(VANILLA_PAGES, 'verify.astro'));

  it('next читает общая функция — только путь сайта', () => {
    expect(verify).toContain(
      'import { nextPathOf } from \'../../../../packages/theme-base/runtime/next-path\';',
    );
    expect(verify).toContain(
      'const next = nextPathOf(window.location.search);',
    );
  });

  it('все три выхода после входа — navTo(next), в /account напрямую не ведёт ни один', () => {
    expect(verify.match(/navTo\(next\)/g)).toHaveLength(3);
    expect(verify).not.toContain("navTo('/account')");
  });
});
