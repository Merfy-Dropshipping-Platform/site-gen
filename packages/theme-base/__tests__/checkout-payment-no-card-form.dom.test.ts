/**
 * Форма карты не рендерится ни в одной из пяти тем (flux, vanilla, rose, satin, bloom).
 *
 * Чекаут всех пяти тем собирается из общего мега-блока theme-base `CheckoutForm`
 * (в нём `CheckoutPayment`): страница темы `themes/<тема>/src/pages/checkout.astro`
 * подключает его и сама оплату не рисует. Проверяем исходники, из которых строится
 * разметка чекаута: ни в самом блоке, ни в теме (страницы, компоненты, блоки пакета
 * темы) нет полей карты, предупреждения под ней и загрузки токенизатора ЮKassa.
 * Поведение скрипта (выбор способа, уход в create-payment) — в соседних
 * `checkout-payment-provider-view` и `checkout-payment-provider-submit`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..', '..');
const THEMES = ['flux', 'vanilla', 'rose', 'satin', 'bloom'] as const;

/** Признаки формы карты и токенизации на витрине. */
const CARD_FORM_MARKERS = [
  'data-card-form-wrapper',
  'data-checkout-card-form',
  'data-card-field',
  'data-card-warning',
  'autocomplete="cc-number"',
  'autocomplete="cc-exp"',
  'autocomplete="cc-csc"',
  'checkout-widget.js',
  'YooMoneyCheckout',
  '__checkoutTokenizeCard',
];

const SOURCE_EXT = /\.(astro|ts|tsx|js|mjs|json)$/;

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.astro') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...sourceFiles(full));
    else if (SOURCE_EXT.test(name)) out.push(full);
  }
  return out;
}

function offenders(dir: string): string[] {
  const bad: string[] = [];
  for (const file of sourceFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    const hit = CARD_FORM_MARKERS.find((m) => text.includes(m));
    if (hit) bad.push(`${file.slice(ROOT.length + 1)} → ${hit}`);
  }
  return bad;
}

describe('форма карты на витрине — убрана', () => {
  it('общие блоки чекаута theme-base без формы карты и токенизатора', () => {
    expect(offenders(join(ROOT, 'packages', 'theme-base', 'blocks'))).toEqual([]);
  });

  it('мега-блок CheckoutForm не передаёт cardForm в CheckoutPayment', () => {
    const text = readFileSync(join(ROOT, 'packages/theme-base/blocks/CheckoutForm/CheckoutForm.astro'), 'utf8');
    expect(text).toContain('<CheckoutPayment');
    expect(text).not.toContain('cardForm');
  });

  describe.each(THEMES)('тема %s', (theme) => {
    it('страница чекаута берёт общий CheckoutForm из theme-base и сама оплату не рисует', () => {
      const page = readFileSync(join(ROOT, 'themes', theme, 'src', 'pages', 'checkout.astro'), 'utf8');
      expect(page).toMatch(/import CheckoutForm from "[./]+\/packages\/theme-base\/blocks\/CheckoutForm\/CheckoutForm\.astro"/);
      expect(page).toContain('<CheckoutForm');
      expect(page).not.toMatch(/<CheckoutPayment/);
    });

    it('в исходниках темы нет полей карты и токенизатора', () => {
      expect([
        ...offenders(join(ROOT, 'themes', theme, 'src')),
        ...offenders(join(ROOT, 'packages', `theme-${theme}`)),
      ]).toEqual([]);
    });

    it('тема не подменяет блок CheckoutPayment своим', () => {
      expect(existsSync(join(ROOT, 'packages', `theme-${theme}`, 'blocks', 'CheckoutPayment'))).toBe(false);
      expect(existsSync(join(ROOT, 'themes', theme, 'src', 'components', 'CheckoutPayment.astro'))).toBe(false);
    });
  });
});
