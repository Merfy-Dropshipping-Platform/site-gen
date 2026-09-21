/**
 * Кнопка «Оформить заказ» в панели корзины ведёт в ЧЕКАУТ — во ВСЕХ панелях,
 * сколько бы их ни завели.
 *
 * Жалоба владельца 20.09: «кнопка оформить заказ при формате сайдбаре ведёт на
 * страницу корзина, а должна вести в чекаут, так как это и есть корзина, но в
 * другом её формате».
 *
 * Панелей в проекте ДВЕ, и это главный урок этого гарда. Первый заход правки
 * закрыл только одну — пакетную (`data-nt="cart-drawer"` из
 * design-systems-theme, у неё единственный проп ссылки `cartHref` с дефолтом
 * `/cart`, и он же на кнопке оформления). Вторая — собственная панель vanilla
 * (`data-nt="vanilla-cart-drawer"`): проп называется честно, `checkoutHref`,
 * но дефолт у него стоял `/cart`, а Layout монтирует панель без этого пропа.
 * Владелец поймал остаток на своём сайте.
 *
 * Поэтому гард не сторожит конкретный файл, а НАХОДИТ все панели в исходниках
 * тем по атрибуту `data-nt`, оканчивающемуся на `cart-drawer`, и проверяет
 * каждую. Появится третья — попадёт под проверку сама.
 *
 * Пакетную панель править нельзя (node_modules), её чинит рантайм `nt-cart`
 * суффиксным селектором — он же накрывает и vanilla, и любую будущую.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const RUNTIME = join(ROOT, 'packages', 'theme-base', 'runtime', 'nt-cart.ts');
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;

function astroFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) astroFiles(p, acc);
    else if (name.endsWith('.astro')) acc.push(p);
  }
  return acc;
}

/** Панели корзины в НАШИХ исходниках: data-nt, оканчивающийся на cart-drawer. */
function ourDrawers(): string[] {
  return astroFiles(join(ROOT, 'themes')).filter((f) => {
    const src = readFileSync(f, 'utf-8');
    // Атрибут ЭЛЕМЕНТА, а не строка внутри querySelector('[data-nt=…]'):
    // Layout-ы тем упоминают панель в своих скриптах, но панелями не являются.
    return /(?<!\[)data-nt="[a-z-]*cart-drawer"/.test(src) && /data-cart-summary/.test(src);
  });
}

describe('панель корзины: кнопка ведёт в чекаут', () => {
  const drawers = ourDrawers();

  it('панели в исходниках вообще нашлись', () => {
    // Ноль найденных = гард молча ничего не проверяет. Это провал, а не успех.
    expect(drawers.length).toBeGreaterThan(0);
  });

  it.each(drawers.map((d) => [d.replace(ROOT + '/', ''), d]))(
    '%s — кнопка подвала не ведёт на страницу корзины',
    (_label, file) => {
      const src = readFileSync(file as string, 'utf-8');
      // Привязываемся к НАДПИСИ кнопки, а не к порядку тегов: в панели
      // несколько ссылок («Продолжить покупки», «Войти»), и брать «первую
      // после подвала» — значит поймать не ту (так гард и ошибся при первом
      // заходе, проверив ссылку на каталог).
      const label = src.indexOf('Оформить заказ');
      expect(label).toBeGreaterThan(-1);
      const before = src.slice(0, label);
      const open = before.lastIndexOf('<a');
      expect(open).toBeGreaterThan(-1);
      const tag = before.slice(open, before.indexOf('>', open) + 1);

      // Прямой литерал на корзину — это и есть баг.
      expect(tag).not.toMatch(/href="\/cart"/);

      // Ссылка через проп — у пропа не должно быть дефолта на корзину.
      const viaProp = /href=\{([A-Za-z_$][\w$]*)\}/.exec(tag);
      if (viaProp) {
        const prop = viaProp[1];
        const def = new RegExp(`${prop}\\s*=\\s*["']([^"']+)["']`).exec(src);
        expect(def).not.toBeNull();
        expect((def as RegExpExecArray)[1]).toBe('/checkout');
      }

      // ViewTransitions: без полной загрузки инлайн-скрипты чекаута не стартуют.
      expect(tag).toMatch(/data-astro-reload/);
    },
  );
});

describe('рантайм чинит панель, которую нельзя править (пакетную)', () => {
  it('рантайм на месте', () => {
    expect(existsSync(RUNTIME)).toBe(true);
  });

  it('селектор суффиксный — накрывает любую панель, а не одну', () => {
    const src = readFileSync(RUNTIME, 'utf-8');
    expect(src).toMatch(/\[data-nt\$="cart-drawer"\]\s*\[data-cart-summary\]\s*a\[href="\/cart"\]/);
    expect(src).toMatch(/setAttribute\(\s*["']href["']\s*,\s*["']\/checkout["']\s*\)/);
    expect(src).toMatch(/setAttribute\(\s*["']data-astro-reload["']/);
  });

  it.each(THEMES)('%s — грузит этот рантайм, значит правку получит', (theme) => {
    const candidates = [
      join(ROOT, 'themes', theme, 'src', 'layouts', 'Layout.astro'),
      join(ROOT, 'themes', theme, 'src', 'components', 'StorefrontRuntime.astro'),
    ].filter((p) => existsSync(p));
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((p) => /nt-cart/.test(readFileSync(p, 'utf-8')))).toBe(true);
  });
});
