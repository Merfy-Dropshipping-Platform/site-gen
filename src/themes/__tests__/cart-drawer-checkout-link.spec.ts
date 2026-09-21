/**
 * Кнопка «Оформить заказ» в панели корзины ведёт в ЧЕКАУТ — во всех пяти темах.
 *
 * Панель это и есть корзина, просто в формате сайдбара (настройка темы
 * «Корзина → Сайдбар»), поэтому вести из корзины в корзину бессмысленно.
 *
 * История трёх заходов, ради которой этот гард и написан:
 *  1. Пакетная панель (`NtCartDrawer` из design-systems-theme) имеет ОДИН проп
 *     ссылки — `cartHref` с дефолтом `/cart`, и он же висит на кнопке. Темы
 *     монтировали панель без пропа. Первая правка подменяла адрес скриптом в
 *     рантайме и накрыла только эту панель.
 *  2. У vanilla своя панель (`data-nt="vanilla-cart-drawer"`), точный селектор
 *     скрипта прошёл мимо неё; вдобавок её собственный проп `checkoutHref`
 *     имел дефолт `/cart`.
 *  3. В превью конструктора все внутренние ссылки получают приставку темы
 *     (`/__theme/<тема>/cart`), и подмена по точному адресу не срабатывала
 *     там вовсе.
 *
 * Итог: адрес ЗАДАЁТСЯ в разметке, а не подменяется скриптом. Так он верен и
 * до загрузки JS, и на страницах без секций корзины (рантайм туда не попадает),
 * и в превью — оно само приклеит приставку, как делает со всеми ссылками.
 *
 * Гард проверяет каждую тему по её способу подключения и не даёт вернуться ни
 * к одному из трёх состояний.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;

/** Файлы темы, в которых может быть подключена панель корзины. */
function mountFiles(theme: string): string[] {
  return [
    join(ROOT, 'themes', theme, 'src', 'layouts', 'Layout.astro'),
    join(ROOT, 'themes', theme, 'src', 'components', 'StorefrontRuntime.astro'),
    join(ROOT, 'themes', theme, 'src', 'components', 'VanillaCartDrawer.astro'),
  ].filter((p) => existsSync(p));
}

describe('панель корзины: кнопка ведёт в чекаут во всех темах', () => {
  it.each(THEMES)('%s — адрес кнопки задан и указывает на чекаут', (theme) => {
    const files = mountFiles(theme);
    // Ни одного файла = гард молча ничего не проверил. Это провал.
    expect(files.length).toBeGreaterThan(0);

    const sources = files.map((f) => readFileSync(f, 'utf-8'));
    const joined = sources.join('\n');

    // Своя панель темы: у пропа ссылки кнопки дефолт обязан вести в чекаут.
    const own = sources.find((s) => /data-nt="[a-z-]+-cart-drawer"/.test(s));
    if (own) {
      const def = /checkoutHref\s*=\s*["']([^"']+)["']/.exec(own);
      expect(def).not.toBeNull();
      expect((def as RegExpExecArray)[1]).toBe('/checkout');
      return;
    }

    // Пакетная панель: тема обязана передать адрес при подключении, иначе
    // применится дефолт пакета `/cart`.
    const mount = /<NtCartDrawer\b[^>]*>/.exec(joined);
    expect(mount).not.toBeNull();
    expect((mount as RegExpExecArray)[0]).toMatch(/cartHref="\/checkout"/);
  });

  it('адрес больше не подменяется скриптом в рантайме', () => {
    // Подмена работала только на живой витрине и только там, где рантайм
    // вообще загружен. Вернётся она — вернутся и три дыры выше.
    const runtime = readFileSync(join(ROOT, 'packages', 'theme-base', 'runtime', 'nt-cart.ts'), 'utf-8');
    expect(runtime).not.toMatch(/setAttribute\(\s*["']href["']\s*,\s*["']\/checkout["']\s*\)/);
  });
});
