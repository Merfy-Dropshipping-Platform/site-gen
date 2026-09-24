/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit × настоящая раскладка CheckoutDeliveryForm (Figma 1:19998):
 * одно поле «Полный адрес» (`address`) + «Индекс», без раздельных
 * street/building/apartment. Разобранный адрес форма кладёт в data-addr-* секции
 * при выборе подсказки DaData.
 *
 * С 28.08 (слияние #34) кнопка ждала поле `street`, которого в форме нет, —
 * «Оплатить» на живых витринах не нажималась никогда. Первый тест сверяет
 * фикстуру с полями настоящих .astro, чтобы такое расхождение ловилось здесь.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const BLOCKS = join(__dirname, '..', 'blocks');
const read = (block: string) => readFileSync(join(BLOCKS, block, `${block}.astro`), 'utf8');

const SUBMIT_SRC = read('CheckoutSubmit');
const SCRIPT = (/<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(SUBMIT_SRC) as RegExpExecArray)[1];

const fieldsOf = (src: string) =>
  [...src.matchAll(/data-checkout-field="([a-zA-Z]+)"/g)].map((m) => m[1]);

/** Поля, которые форма чекаута рендерит сегодня (split-раскладка имени). */
const FORM_FIELDS = ['email', 'phone', 'country', 'firstName', 'lastName', 'city', 'address', 'postalCode'];

type Values = Partial<Record<(typeof FORM_FIELDS)[number], string>>;
type Parsed = Partial<Record<'street' | 'building' | 'apartment', string>>;

function mount(values: Values = {}, parsed: Parsed = {}): HTMLElement {
  const v: Record<string, string> = {
    email: 'a@b.ru', phone: '+79990000000', country: 'Россия',
    firstName: 'Иван', lastName: 'Петров', city: 'Москва',
    address: 'г Москва, ул Тверская, д 1, кв 5', postalCode: '125009',
    ...values,
  };
  const attrs = Object.entries(parsed).map(([k, val]) => ` data-addr-${k}="${val}"`).join('');
  document.body.innerHTML = `
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button data-checkout-submit disabled>Оформить — —</button>
    </section>
    <div data-checkout-delivery data-selected-city-fias-id="fias-1"${attrs}></div>
    ${FORM_FIELDS.map((f) => `<div data-checkout-field="${f}"><input value="${v[f]}" /></div>`).join('\n')}`;
  return document.querySelector('[data-block="checkout-submit"]') as HTMLElement;
}

function run(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  // eslint-disable-next-line no-new-func
  new Function('buttonText', 'loadingText', 'successRedirectUrl', 'blockId', SCRIPT)(
    'Оформить — {total}', 'Оформляем…', '/checkout/result', 'cs-1',
  );
  return section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
}

const choose = (detail: Record<string, unknown>) =>
  document.dispatchEvent(new CustomEvent('checkout:delivery-changed', { detail }));

const SELF_PICKUP = { type: 'self_pickup', label: 'Самовывоз', costCents: 0, tariffCode: null };
const OWN_COURIER = { type: 'own_courier', label: 'Курьер магазина', costCents: 30000, tariffCode: null };
const CDEK_DOOR = { type: 'cdek_door', label: 'CDEK курьер', costCents: 40000, tariffCode: 137 };

function chainFetch(): jest.Mock {
  return jest.fn((url: string) => {
    if (/\/checkout$/.test(url)) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
    }
    if (/\/create-payment$/.test(url)) {
      return Promise.resolve({ ok: true, json: async () => ({ data: { confirmationUrl: 'https://pay.test/x' } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

const bodyOf = (mock: jest.Mock, re: RegExp) => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? JSON.parse((call[1] as any).body) : null;
};

async function submit(btn: HTMLButtonElement) {
  btn.click();
  await new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
  (window as any).cartStore = {
    getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
    getTotal: () => 100000,
    syncToServer: jest.fn(async () => 'cart_new'),
  };
  (window as any).fetch = jest.fn();
  delete (window as any).location;
  (window as any).location = { origin: 'https://shop.test', href: '' };
});

afterEach(() => {
  for (const k of ['cartStore', 'fetch', '__merfyRoot', '__MERFY_CONFIG__']) delete (window as any)[k];
});

describe('CheckoutSubmit — раскладка «Полный адрес»', () => {
  it('фикстура совпадает с полями настоящих CheckoutContactForm + CheckoutDeliveryForm', () => {
    const real = new Set([...fieldsOf(read('CheckoutContactForm')), ...fieldsOf(read('CheckoutDeliveryForm'))]);
    FORM_FIELDS.forEach((f) => expect(real).toContain(f));
    expect(real).not.toContain('street');
  });

  it.each([
    ['самовывоз', SELF_PICKUP],
    ['курьер магазина', OWN_COURIER],
  ])('все поля заполнены, %s → кнопка активна', (_, method) => {
    const btn = run(mount());
    choose(method);
    expect(btn.disabled).toBe(false);
  });

  it('курьер без адреса → кнопка неактивна', () => {
    const btn = run(mount({ address: '' }));
    choose(OWN_COURIER);
    expect(btn.disabled).toBe(true);
  });

  it('CDEK до двери: дом из подсказки DaData → кнопка активна', () => {
    const btn = run(mount({}, { street: 'ул Тверская', building: '1' }));
    choose(CDEK_DOOR);
    expect(btn.disabled).toBe(false);
  });

  it('CDEK до двери: адрес набран руками, дом не разобран → кнопка неактивна', () => {
    const btn = run(mount());
    choose(CDEK_DOOR);
    expect(btn.disabled).toBe(true);
  });

  it('разобранный адрес уходит в PATCH /address раздельно, «Полный адрес» — в metadata', async () => {
    const fetchMock = chainFetch();
    (window as any).fetch = fetchMock;
    const btn = run(mount({}, { street: 'ул Тверская', building: '1', apartment: '5' }));
    choose(CDEK_DOOR);
    await submit(btn);

    expect(bodyOf(fetchMock, /\/address$/)).toMatchObject({
      city: 'Москва', street: 'ул Тверская', building: '1', apartment: '5', postalCode: '125009',
    });
    expect(bodyOf(fetchMock, /\/checkout$/).metadata.deliveryAddress.fullAddress)
      .toBe('г Москва, ул Тверская, д 1, кв 5');
  });

  it('адрес набран руками → улицей уходит весь «Полный адрес»', async () => {
    const fetchMock = chainFetch();
    (window as any).fetch = fetchMock;
    const btn = run(mount({ address: 'ул Ленина 7' }));
    choose(OWN_COURIER);
    await submit(btn);

    expect(bodyOf(fetchMock, /\/address$/)).toMatchObject({ street: 'ул Ленина 7', building: '', apartment: '' });
  });
});
