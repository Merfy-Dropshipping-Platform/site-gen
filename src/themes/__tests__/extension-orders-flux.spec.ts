/**
 * Задача 5.4 спеки 120 на flux: записи расширений в «Моих заказах» и страница
 * записи, вход по ссылке письма ведёт по `next`, страницы и ссылка «Мои заявки»
 * первой версии убраны. Остальные четыре темы — отдельным заходом (владелец
 * 11.10: «только для теста на одной теме флюкс»), их здесь не трогаем.
 *
 * Секция «Заказы» проверяется по тому, что реально уезжает на витрину:
 * скомпилированный модуль секции (dist/theme-sections/flux) рендерится
 * Container API. Требует сборки: pnpm build:theme-sections flux.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXTENSION_ORDERS_RUNTIME_SOURCE } from '../../../packages/theme-base/runtime/extension-orders.runtime';
import { EXTENSION_ORDERS_STYLES } from '../../../packages/theme-base/runtime/extension-orders.styles';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const FLUX_PAGES = resolve(SITES_ROOT, 'themes/flux/src/pages');
const OTHER_THEMES = ['rose', 'bloom', 'satin', 'vanilla'] as const;

const read = (path: string): string => readFileSync(path, 'utf8');

function renderOrdersSection(): string {
  const rows = JSON.parse(
    execFileSync(
      'node',
      [RENDERER, 'flux', JSON.stringify([{ block: 'OrdersSection', props: { id: 'OrdersSection-1' } }])],
      { cwd: SITES_ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
    ),
  ) as Array<{ html?: string; error?: string }>;
  expect(rows[0]?.error).toBeUndefined();
  return rows[0]?.html ?? '';
}

describe('flux: секция «Заказы» добавляет записи расширений', () => {
  const html = renderOrdersSection();

  it('несёт строку рантайма и её стили', () => {
    expect(html).toContain(EXTENSION_ORDERS_RUNTIME_SOURCE.slice(0, 2000));
    expect(html).toContain(EXTENSION_ORDERS_STYLES.slice(0, 500));
  });

  it('зовёт mountRows со страницей записи /account/entry и показывает список, если строки пришли', () => {
    expect(html).toContain('window.__merfyExtensionOrders');
    expect(html).toContain('entryPath: "/account/entry"');
    expect(html).toContain('if (count > 0) showList(root);');
  });

  it('строка заказа несёт дату — по ней записи встают среди заказов', () => {
    expect(html).toContain('row.dataset.date = order.createdAt || "";');
  });
});

describe('flux: страница записи без пункта меню', () => {
  const entry = read(resolve(FLUX_PAGES, 'account/entry.astro'));

  it('рисует запись общим рантаймом, «← Мои заказы» ведёт в /account/orders', () => {
    expect(entry).toContain("import { mountRecordEntry } from '../../../../../packages/theme-base/runtime/extension-orders';");
    expect(entry).toContain("ordersPath: '/account/orders'");
    expect(entry).toContain('search: window.location.search');
    expect(entry).toContain('set:html={EXTENSION_ORDERS_STYLES}');
  });

  it('без сессии покупателя — на вход', () => {
    expect(entry).toContain("if (!getToken()) {\n        navTo('/login');");
  });

  it('в меню кабинета её нет, ссылки «Мои заявки» тоже', () => {
    const index = read(resolve(FLUX_PAGES, 'account/index.astro'));
    expect(index).toContain('href="/account/orders"');
    expect(index).not.toContain('/account/entry');
    expect(index).not.toContain('/account/requests');
    expect(index).not.toContain('Мои заявки');
  });
});

describe('flux: страницы первой версии убраны, у остальных тем — пока на месте', () => {
  it('у flux нет account/requests.astro и account/request.astro', () => {
    expect(existsSync(resolve(FLUX_PAGES, 'account/requests.astro'))).toBe(false);
    expect(existsSync(resolve(FLUX_PAGES, 'account/request.astro'))).toBe(false);
  });

  it.each(OTHER_THEMES)('%s не тронута', (theme) => {
    expect(existsSync(resolve(SITES_ROOT, `themes/${theme}/src/pages/account/requests.astro`))).toBe(true);
  });
});

describe('flux: вход по ссылке из письма ведёт по next', () => {
  const verify = read(resolve(FLUX_PAGES, 'verify.astro'));

  it('next читает общая функция — только путь сайта', () => {
    expect(verify).toContain("import { nextPathOf } from '../../../../packages/theme-base/runtime/next-path';");
    expect(verify).toContain('const next = nextPathOf(window.location.search);');
  });

  it('все три выхода после входа — navTo(next), в /account напрямую не ведёт ни один', () => {
    expect(verify.match(/navTo\(next\)/g)).toHaveLength(3);
    expect(verify).not.toContain("navTo('/account')");
  });
});
