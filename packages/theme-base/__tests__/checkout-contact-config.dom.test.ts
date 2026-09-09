/**
 * @jest-environment jsdom
 *
 * CheckoutContactForm — рантайм-конфиг чекаута (Фаза 4a), слой рендер/раскладка:
 *  - contactMethod="email"      → телефон скрыт, email растянут (md:col-span-2);
 *  - contactMethod="email-phone"/дефолт → оба поля видны, без растяжки;
 *  - обратимость (email → email-phone возвращает исходное состояние);
 *  - обе точки применения: сразу на init (конфиг уже есть) и по событию
 *    'checkout:config-ready'.
 * Конфиг-скрипт извлекается из .astro и исполняется в jsdom.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(
  __dirname,
  '..',
  'blocks',
  'CheckoutContactForm',
  'CheckoutContactForm.astro',
);

/** Тело <script>, содержащего маркер (в .astro теперь 2 скрипта). */
function scriptBodyWith(src: string, marker: string): string {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1].includes(marker)) return m[1];
  }
  throw new Error(`no <script> with marker "${marker}" in CheckoutContactForm.astro`);
}

const CONFIG_SCRIPT = scriptBodyWith(
  readFileSync(ASTRO, 'utf8'),
  'initCheckoutContactConfig',
);

const FIELD_FULL = 'md:col-span-2';

function mountDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-contact data-puck-component-id="ccf-1">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <div class="field" data-checkout-field="email">
          <input id="checkout-email" name="email" type="email" />
        </div>
        <div class="field" data-checkout-field="phone" data-format="ru">
          <input id="checkout-phone" name="phone" type="tel" data-checkout-phone />
        </div>
      </div>
    </section>`;
  return document.querySelector('[data-checkout-contact]') as HTMLElement;
}

function runConfigScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  // eslint-disable-next-line no-new-func
  new Function('blockId', 'fieldFullClass', CONFIG_SCRIPT)('ccf-1', FIELD_FULL);
}

function setConfig(checkout: Record<string, unknown> | null) {
  (window as any).__MERFY_CONFIG__ = checkout ? { checkout } : {};
}

function fireConfigReady() {
  document.dispatchEvent(new CustomEvent('checkout:config-ready'));
}

describe('CheckoutContactForm — runtime config (contactMethod)', () => {
  let email: HTMLElement;
  let phone: HTMLElement;

  function els(section: HTMLElement) {
    email = section.querySelector('[data-checkout-field="email"]') as HTMLElement;
    phone = section.querySelector('[data-checkout-field="phone"]') as HTMLElement;
  }

  afterEach(() => {
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  it('дефолт (нет .checkout) → оба поля видны, email без растяжки (нулевая регрессия)', () => {
    setConfig(null);
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(false);
    expect(email.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);
  });

  it('contactMethod="email-phone" явно → оба видны, без растяжки', () => {
    setConfig({ contactMethod: 'email-phone' });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);
  });

  it('contactMethod="email" (конфиг уже есть на init) → телефон скрыт, email на всю ширину', () => {
    setConfig({ contactMethod: 'email' });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);
  });

  it('contactMethod="email" по событию checkout:config-ready → телефон скрыт, email растянут', () => {
    setConfig(null);
    const section = mountDom();
    runConfigScript(section); // init без конфига — оба видны
    els(section);
    expect(phone.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);

    // Продюсер выставил конфиг позже и диспатчнул событие.
    setConfig({ contactMethod: 'email' });
    fireConfigReady();

    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);
  });

  it('обратимость: email → email-phone возвращает телефон и снимает растяжку', () => {
    setConfig({ contactMethod: 'email' });
    const section = mountDom();
    runConfigScript(section);
    els(section);
    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);

    setConfig({ contactMethod: 'email-phone' });
    fireConfigReady();

    expect(phone.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);
  });

  it('идемпотентность: повторный config-ready с тем же email не ломает состояние', () => {
    setConfig({ contactMethod: 'email' });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    fireConfigReady();
    fireConfigReady();

    expect(phone.hidden).toBe(true);
    // classList.add идемпотентен — токен ровно один.
    expect(email.className.split(/\s+/).filter((c) => c === FIELD_FULL).length).toBe(1);
  });
});
