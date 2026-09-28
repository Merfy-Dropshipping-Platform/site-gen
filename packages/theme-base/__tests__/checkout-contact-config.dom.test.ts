/**
 * @jest-environment jsdom
 *
 * CheckoutContactForm — рантайм-конфиг чекаута (Фаза 4a), слой рендер/раскладка.
 *
 * Правило владельца 28.09: при необязательной регистрации телефона на
 * чекауте нет, почта остаётся. Телефон виден и обязателен ТОЛЬКО когда
 * requireCustomerAuth===true И contactMethod!=='email'. Во всех остальных
 * случаях (регистрация необязательна ИЛИ contactMethod='email') работает
 * режим «только почта»: телефон скрыт, email растянут (md:col-span-2).
 *
 * Покрывает:
 *  - дефолт (нет .checkout вовсе) → email-only (новый дефолт, не регрессия);
 *  - requireCustomerAuth=true + contactMethod (не задан / 'email-phone') → оба поля видны;
 *  - requireCustomerAuth=true + contactMethod='email' → email-only (регистрация не отменяет email-only режим);
 *  - requireCustomerAuth=false/не задан + contactMethod='email-phone' → email-only (регистрация решает, не contactMethod);
 *  - обратимость по событию 'checkout:config-ready';
 *  - идемпотентность повторного применения.
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

describe('CheckoutContactForm — runtime config (requireCustomerAuth × contactMethod, владелец 28.09)', () => {
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

  it('дефолт (нет .checkout) → email-only: телефон скрыт, email растянут (новый дефолт владельца 28.09, не регрессия)', () => {
    setConfig(null);
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);
  });

  it("requireCustomerAuth не задан + contactMethod='email-phone' → всё равно email-only (регистрация необязательна)", () => {
    setConfig({ contactMethod: 'email-phone' });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);
  });

  it("requireCustomerAuth=false + contactMethod='email-phone' → email-only (флаг явно выключен)", () => {
    setConfig({ requireCustomerAuth: false, contactMethod: 'email-phone' });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);
  });

  it('requireCustomerAuth=true, contactMethod не задан (дефолт email-phone) → оба поля видны, без растяжки', () => {
    setConfig({ requireCustomerAuth: true });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);
  });

  it("requireCustomerAuth=true + contactMethod='email-phone' явно → оба видны, без растяжки", () => {
    setConfig({ requireCustomerAuth: true, contactMethod: 'email-phone' });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);
  });

  it("requireCustomerAuth=true + contactMethod='email' → email-only (регистрация обязательна, но канал контакта — только почта)", () => {
    setConfig({ requireCustomerAuth: true, contactMethod: 'email' });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);
  });

  it('requireCustomerAuth=true по событию checkout:config-ready → телефон появляется', () => {
    setConfig(null);
    const section = mountDom();
    runConfigScript(section); // init без конфига — email-only
    els(section);
    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);

    // Продюсер выставил конфиг позже и диспатчнул событие.
    setConfig({ requireCustomerAuth: true, contactMethod: 'email-phone' });
    fireConfigReady();

    expect(phone.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);
  });

  it('обратимость: requireCustomerAuth true→false возвращает email-only (телефон скрывается обратно)', () => {
    setConfig({ requireCustomerAuth: true, contactMethod: 'email-phone' });
    const section = mountDom();
    runConfigScript(section);
    els(section);
    expect(phone.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);

    setConfig({ requireCustomerAuth: false, contactMethod: 'email-phone' });
    fireConfigReady();

    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);
  });

  it('идемпотентность: повторный config-ready с тем же конфигом не ломает состояние', () => {
    setConfig({ requireCustomerAuth: true, contactMethod: 'email-phone' });
    const section = mountDom();
    runConfigScript(section);
    els(section);

    fireConfigReady();
    fireConfigReady();

    expect(phone.hidden).toBe(false);
    // classList.remove идемпотентен — токена нет ни разу лишний раз не добавлен.
    expect(email.className.split(/\s+/).filter((c) => c === FIELD_FULL).length).toBe(0);
  });
});
