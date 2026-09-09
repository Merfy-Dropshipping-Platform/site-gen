/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryForm — рантайм-конфиг чекаута (Фаза 4a), слой рендер/раскладка:
 *  - customerNameMode "name-surname"/дефолт → Имя + Фамилия видны, без растяжки;
 *  - customerNameMode "surname"             → Имя скрыто, Фамилия на всю ширину;
 *  - customerNameMode "name"                → Фамилия скрыта, Имя на всю ширину;
 *  - addressRequired=false                  → все [data-checkout-address] скрыты,
 *    поля имени НЕ трогаются;
 *  - обратимость + идемпотентность.
 * Конфиг-скрипт извлекается из .astro (второй <script>) и исполняется в jsdom.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(
  __dirname,
  '..',
  'blocks',
  'CheckoutDeliveryForm',
  'CheckoutDeliveryForm.astro',
);

/** Тело <script>, содержащего маркер (в .astro DaData-скрипт + конфиг-скрипт). */
function scriptBodyWith(src: string, marker: string): string {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1].includes(marker)) return m[1];
  }
  throw new Error(`no <script> with marker "${marker}" in CheckoutDeliveryForm.astro`);
}

const CONFIG_SCRIPT = scriptBodyWith(
  readFileSync(ASTRO, 'utf8'),
  'initCheckoutDeliveryConfig',
);

const FIELD_FULL = 'md:col-span-2';

function mountDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery data-puck-component-id="cdf-1">
      <div class="fields">
        <!-- страна (адрес) -->
        <div class="field" data-checkout-field="country" data-checkout-address></div>

        <!-- имя/фамилия — split, НЕ адрес -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5" data-name-row>
          <div class="field" data-checkout-field="firstName"></div>
          <div class="field" data-checkout-field="lastName"></div>
        </div>

        <!-- город + индекс (адрес) -->
        <div class="grid" data-checkout-address data-city-index-row>
          <div class="field" data-checkout-field="city"></div>
          <div class="field" data-checkout-field="postalCode"></div>
        </div>

        <!-- улица (адрес) -->
        <div class="field" data-checkout-field="street" data-checkout-address></div>

        <!-- дом + кв. (адрес) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5" data-checkout-address data-house-row>
          <div class="field" data-checkout-field="building"></div>
          <div class="field" data-checkout-field="apartment"></div>
        </div>
      </div>
    </section>`;
  return document.querySelector('[data-checkout-delivery]') as HTMLElement;
}

function runConfigScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  // eslint-disable-next-line no-new-func
  new Function('blockId', 'fieldFullClass', CONFIG_SCRIPT)('cdf-1', FIELD_FULL);
}

function setConfig(checkout: Record<string, unknown> | null) {
  (window as any).__MERFY_CONFIG__ = checkout ? { checkout } : {};
}

function fireConfigReady() {
  document.dispatchEvent(new CustomEvent('checkout:config-ready'));
}

describe('CheckoutDeliveryForm — runtime config', () => {
  let first: HTMLElement;
  let last: HTMLElement;

  function nameEls(section: HTMLElement) {
    first = section.querySelector('[data-checkout-field="firstName"]') as HTMLElement;
    last = section.querySelector('[data-checkout-field="lastName"]') as HTMLElement;
  }

  afterEach(() => {
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  describe('customerNameMode', () => {
    it('дефолт (нет .checkout) → Имя + Фамилия видны, без растяжки', () => {
      setConfig(null);
      const section = mountDom();
      runConfigScript(section);
      nameEls(section);

      expect(first.hidden).toBe(false);
      expect(last.hidden).toBe(false);
      expect(first.classList.contains(FIELD_FULL)).toBe(false);
      expect(last.classList.contains(FIELD_FULL)).toBe(false);
    });

    it('"name-surname" явно → оба видны, без растяжки', () => {
      setConfig({ customerNameMode: 'name-surname' });
      const section = mountDom();
      runConfigScript(section);
      nameEls(section);

      expect(first.hidden).toBe(false);
      expect(last.hidden).toBe(false);
      expect(first.classList.contains(FIELD_FULL)).toBe(false);
      expect(last.classList.contains(FIELD_FULL)).toBe(false);
    });

    it('"surname" → Имя скрыто, Фамилия на всю ширину', () => {
      setConfig({ customerNameMode: 'surname' });
      const section = mountDom();
      runConfigScript(section);
      nameEls(section);

      expect(first.hidden).toBe(true);
      expect(last.hidden).toBe(false);
      expect(last.classList.contains(FIELD_FULL)).toBe(true);
      expect(first.classList.contains(FIELD_FULL)).toBe(false);
    });

    it('"name" → Фамилия скрыта, Имя на всю ширину', () => {
      setConfig({ customerNameMode: 'name' });
      const section = mountDom();
      runConfigScript(section);
      nameEls(section);

      expect(last.hidden).toBe(true);
      expect(first.hidden).toBe(false);
      expect(first.classList.contains(FIELD_FULL)).toBe(true);
      expect(last.classList.contains(FIELD_FULL)).toBe(false);
    });

    it('обратимость: surname → name-surname возвращает оба поля без растяжки', () => {
      setConfig({ customerNameMode: 'surname' });
      const section = mountDom();
      runConfigScript(section);
      nameEls(section);
      expect(first.hidden).toBe(true);
      expect(last.classList.contains(FIELD_FULL)).toBe(true);

      setConfig({ customerNameMode: 'name-surname' });
      fireConfigReady();

      expect(first.hidden).toBe(false);
      expect(last.hidden).toBe(false);
      expect(first.classList.contains(FIELD_FULL)).toBe(false);
      expect(last.classList.contains(FIELD_FULL)).toBe(false);
    });

    it('по событию: surname применяется через checkout:config-ready', () => {
      setConfig(null);
      const section = mountDom();
      runConfigScript(section);
      nameEls(section);
      expect(first.hidden).toBe(false);

      setConfig({ customerNameMode: 'surname' });
      fireConfigReady();

      expect(first.hidden).toBe(true);
      expect(last.classList.contains(FIELD_FULL)).toBe(true);
    });
  });

  describe('addressRequired', () => {
    it('addressRequired=false → все [data-checkout-address] скрыты, имя не тронуто', () => {
      setConfig({ addressRequired: false });
      const section = mountDom();
      runConfigScript(section);
      nameEls(section);

      const addrRows = section.querySelectorAll('[data-checkout-address]');
      expect(addrRows.length).toBe(4);
      addrRows.forEach((row) => expect((row as HTMLElement).hidden).toBe(true));

      // Поля имени не адресные — остаются видимыми.
      expect(first.hidden).toBe(false);
      expect(last.hidden).toBe(false);
    });

    it('дефолт/true → все адресные ряды видимы', () => {
      setConfig({ addressRequired: true });
      const section = mountDom();
      runConfigScript(section);

      const addrRows = section.querySelectorAll('[data-checkout-address]');
      addrRows.forEach((row) => expect((row as HTMLElement).hidden).toBe(false));
    });

    it('обратимость: false → true возвращает адресные ряды', () => {
      setConfig({ addressRequired: false });
      const section = mountDom();
      runConfigScript(section);

      let addrRows = section.querySelectorAll('[data-checkout-address]');
      addrRows.forEach((row) => expect((row as HTMLElement).hidden).toBe(true));

      setConfig({ addressRequired: true });
      fireConfigReady();

      addrRows = section.querySelectorAll('[data-checkout-address]');
      addrRows.forEach((row) => expect((row as HTMLElement).hidden).toBe(false));
    });

    it('name row (не адрес) НЕ помечен data-checkout-address', () => {
      const section = mountDom();
      const nameRow = section.querySelector('[data-name-row]') as HTMLElement;
      expect(nameRow.hasAttribute('data-checkout-address')).toBe(false);
    });
  });

  it('комбинация: surname + addressRequired=false применяются вместе', () => {
    setConfig({ customerNameMode: 'surname', addressRequired: false });
    const section = mountDom();
    runConfigScript(section);
    nameEls(section);

    expect(first.hidden).toBe(true);
    expect(last.classList.contains(FIELD_FULL)).toBe(true);
    section
      .querySelectorAll('[data-checkout-address]')
      .forEach((row) => expect((row as HTMLElement).hidden).toBe(true));
  });
});
