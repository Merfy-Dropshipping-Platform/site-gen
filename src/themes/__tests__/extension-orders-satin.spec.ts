/**
 * Задача 5.4 спеки 120 на satin (по образцу flux, тот же диф): записи
 * расширений в «Моих заказах» и страница записи, вход по ссылке письма ведёт
 * по `next`, страницы и ссылка «Мои заявки» первой версии убраны. Этап 5 на
 * satin: список записей и страница записи — в режиме «как тема»
 * (data-look="theme"): цвета и скругления из токенов satin, строки записей
 * не отличаются от строк заказов рядом.
 *
 * Секция «Заказы» проверяется по тому, что реально уезжает на витрину:
 * скомпилированный модуль секции (dist/theme-sections/satin) рендерится
 * Container API. Требует сборки: pnpm build:theme-sections satin.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXTENSION_ORDERS_RUNTIME_SOURCE } from '../../../packages/theme-base/runtime/extension-orders.runtime';
import { EXTENSION_ORDERS_STYLES } from '../../../packages/theme-base/runtime/extension-orders.styles';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const VANILLA_PAGES = resolve(SITES_ROOT, 'themes/satin/src/pages');
// Темы, которые ещё хранят requests.astro первой версии (здесь satin убрала).

const read = (path: string): string => readFileSync(path, 'utf8');

function renderOrdersSection(): string {
  const rows = JSON.parse(
    execFileSync(
      'node',
      [
        RENDERER,
        'satin',
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

describe('satin: секция «Заказы» добавляет записи расширений', () => {
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

  it('контейнер списка — с data-look="theme": строки записей в токенах satin', () => {
    expect(html).toContain('id="orders-list"');
    expect(html).toContain('data-look="theme"');
  });

  it('строка заказа несёт дату — по ней записи встают среди заказов', () => {
    expect(html).toContain('row.dataset.date = order.createdAt || "";');
  });
});

describe('satin: страница записи без пункта меню', () => {
  const entry = read(resolve(VANILLA_PAGES, 'account/entry.astro'));

  it('рисует запись общим рантаймом в режиме «как тема», «← Мои заказы» ведёт в /account/orders', () => {
    expect(entry).toContain(
      'import { mountRecordEntry } from \'../../../../../packages/theme-base/runtime/extension-orders\';',
    );
    expect(entry).toContain("ordersPath: '/account/orders'");
    expect(entry).toContain('search: window.location.search');
    expect(entry).toContain('set:html={EXTENSION_ORDERS_STYLES}');
    expect(entry).toContain('data-look="theme"');
  });

  it('без сессии покупателя — на вход', () => {
    expect(entry).toContain("if (!getToken()) {\n        navTo('/login');");
  });

  it('в меню кабинета её нет, ссылки «Мои заявки» тоже', () => {
    const index = read(resolve(VANILLA_PAGES, 'account/index.astro'));
    expect(index).toContain('href="/account/orders"');
    expect(index).not.toContain('/account/entry');
    expect(index).not.toContain('/account/requests');
    expect(index).not.toContain('Мои заявки');
  });
});

describe('satin: страницы первой версии убраны', () => {
  it('у satin нет account/requests.astro и account/request.astro', () => {
    expect(existsSync(resolve(VANILLA_PAGES, 'account/requests.astro'))).toBe(
      false,
    );
    expect(existsSync(resolve(VANILLA_PAGES, 'account/request.astro'))).toBe(
      false,
    );
  });

});

describe('satin: вход по ссылке из письма — стоп этапа 5 (базовая линия)', () => {
  const verify = read(resolve(VANILLA_PAGES, 'verify.astro'));

  // Переход по ?next= закрывает известный GAP
  // satin.flow.auth.verify-return-propagation, а базовая линия conformance
  // пинит его как текущую находку: закрытие требует осознанного
  // shrink-baseline (действие владельца), задание менять базовую линию
  // запрещает. До решения verify работает как раньше.
  it('next НЕ подключён — переход остаётся в /account', () => {
    expect(verify).not.toContain('nextPathOf');
  });

  // У satin один механизм выхода — goAfterAuth (sessionStorage + safeRedirect);
  // next встроен в него: сначала ?next=, затем authRedirect, всё через safeRedirect.
  it('все три выхода после входа — в /account, как раньше', () => {
    expect(verify.match(/navTo\('\/account'\)/g)).toHaveLength(3);
  });
});
