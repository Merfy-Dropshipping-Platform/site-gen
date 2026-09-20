/**
 * Кнопка «Оформить заказ» в панели корзины ведёт в ЧЕКАУТ, а не на страницу
 * корзины.
 *
 * Жалоба владельца 20.09: «кнопка оформить заказ при формате сайдбаре ведёт на
 * страницу корзина, а должна вести в чекаут, так как это и есть корзина, но в
 * другом её формате». Воспроизведено на живом стенде bloom
 * (`--cart-type: drawer`): в подвале панели ровно одна ссылка —
 * `href="/cart"`, подпись «Оформить заказ».
 *
 * Откуда баг. Разметку панели отдаёт внешний пакет design-systems-theme
 * (`NtCartDrawer.astro`): у него ОДИН проп ссылки — `cartHref` со значением по
 * умолчанию `/cart`, и он же навешан на кнопку оформления. Все пять тем
 * монтируют панель без этого пропа, поэтому баг одинаков везде.
 *
 * Чинится в общей точке — рантайме `nt-cart`, который рисует содержимое панели
 * во всех темах. Гард сторожит две вещи разом: адрес и `data-astro-reload`
 * (без него на темах с ViewTransitions — rose, vanilla, bloom — чекаут
 * открывается SPA-переходом, и его инлайн-скрипты DaData/СДЭК/оплаты не
 * стартуют; ровно поэтому тот же атрибут стоит у кнопки на странице корзины).
 *
 * Почему исходник, а не рендер: панель приходит из node_modules и собирается
 * бандлером темы — в снимках секций её нет, отрисовать её в этом прогоне
 * (окружение `node`, без jsdom) нечем. Поведение проверено в браузере на живом
 * стенде: до правки кнопка вела на /cart, после — открывает /checkout.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const RUNTIME = join(ROOT, 'packages', 'theme-base', 'runtime', 'nt-cart.ts');
const THEMES = ['rose', 'vanilla', 'flux', 'satin', 'bloom'] as const;

describe('панель корзины: кнопка ведёт в чекаут', () => {
  it('рантайм панели на месте', () => {
    expect(existsSync(RUNTIME)).toBe(true);
  });

  it('кнопка подвала панели переводится на /checkout', () => {
    const src = readFileSync(RUNTIME, 'utf-8');
    // Ищем именно связку «подвал панели → ссылка на корзину», а не любое
    // упоминание /checkout в файле.
    expect(src).toMatch(
      /\[data-nt="cart-drawer"\]\s*\[data-cart-summary\]\s*a\[href="\/cart"\]/,
    );
    expect(src).toMatch(/setAttribute\(\s*["']href["']\s*,\s*["']\/checkout["']\s*\)/);
  });

  it('и получает data-astro-reload (иначе чекаут открывается мёртвым)', () => {
    const src = readFileSync(RUNTIME, 'utf-8');
    expect(src).toMatch(/setAttribute\(\s*["']data-astro-reload["']/);
  });

  it.each(THEMES)('%s — панель монтируется и правку получит', (theme) => {
    // Панель рисует общий рантайм; если тема его не грузит, правка до неё не
    // доедет — молчаливый пропуск здесь недопустим.
    const candidates = [
      join(ROOT, 'themes', theme, 'src', 'layouts', 'Layout.astro'),
      join(ROOT, 'themes', theme, 'src', 'components', 'StorefrontRuntime.astro'),
    ].filter((p) => existsSync(p));
    expect(candidates.length).toBeGreaterThan(0);
    const mounts = candidates.some((p) => /nt-cart/.test(readFileSync(p, 'utf-8')));
    expect(mounts).toBe(true);
  });
});
