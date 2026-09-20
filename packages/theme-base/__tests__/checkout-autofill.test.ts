import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Баги тестера #11 и #12 (18.09):
 *  • «Автозаполнение адреса отключено принудительно. На восьми полях контактов
 *    и доставки стоит autocomplete="off". Ожидаемо: email, tel, given-name,
 *    family-name, address-level2, street-address, postal-code».
 *  • «На телефоне для индекса открывается буквенная клавиатура. Поле „Индекс“ —
 *    type=text без inputmode="numeric"».
 *
 * Замер живого чекаута 20.09: 9 полей с autocomplete="off" (8 адресных +
 * промокод). Порты тем чекаут не дублируют — правка в theme-base и есть живой
 * путь, проверено по HTML витрины.
 */
const BLOCKS = join(__dirname, '..', 'blocks');

const readBlock = (name: string) =>
  readFileSync(join(BLOCKS, name, `${name}.astro`), 'utf8');

function inputByName(src: string, name: string): string {
  const re = new RegExp(`<input[^>]*name="${name}"[^>]*>`, 's');
  const m = src.match(re);
  if (!m) throw new Error(`поле ${name} не найдено`);
  return m[0];
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};

describe('чекаут не мешает автозаполнению браузера', () => {
  const contact = readBlock('CheckoutContactForm');
  const delivery = readBlock('CheckoutDeliveryForm');

  const cases: Array<[string, string, string]> = [
    ['CheckoutContactForm', 'email', 'email'],
    ['CheckoutContactForm', 'phone', 'tel'],
    ['CheckoutDeliveryForm', 'firstName', 'given-name'],
    ['CheckoutDeliveryForm', 'lastName', 'family-name'],
    ['CheckoutDeliveryForm', 'fullName', 'name'],
    ['CheckoutDeliveryForm', 'country', 'country-name'],
    ['CheckoutDeliveryForm', 'city', 'address-level2'],
    ['CheckoutDeliveryForm', 'address', 'street-address'],
    ['CheckoutDeliveryForm', 'postalCode', 'postal-code'],
  ];

  it.each(cases)('%s: поле %s подсказывает браузеру «%s»', (block, field, expected) => {
    const src = block === 'CheckoutContactForm' ? contact : delivery;
    expect(attr(inputByName(src, field), 'autocomplete')).toBe(expected);
  });

  it('ни одно адресное поле не гасит автозаполнение', () => {
    for (const [block, field] of cases) {
      const src = block === 'CheckoutContactForm' ? contact : delivery;
      expect(attr(inputByName(src, field), 'autocomplete')).not.toBe('off');
    }
  });

  it('индекс открывает цифровую клавиатуру (баг #12)', () => {
    const tag = inputByName(delivery, 'postalCode');
    expect(attr(tag, 'inputmode')).toBe('numeric');
  });
});
