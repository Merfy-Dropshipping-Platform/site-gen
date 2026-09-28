/**
 * @jest-environment jsdom
 */
/**
 * Чекаут сразу называет товар, который магазин не доставляет.
 *
 * Владелец 26.09 (магазин MrMerfy): «Оплатить» серая, а блок доставки
 * 17 секунд показывал «Считаем варианты доставки…» и потом «Нет доступных
 * вариантов доставки для этого адреса». Дело было не в адресе: товара не было
 * в профиле доставки магазина, логистика отдавала его в `unavailableProducts`
 * (такой ответ окончательный), а блок этот список не читал и гонял лесенку
 * повторов 0/2/5/10 с.
 *
 * Прогон — настоящий скрипт блока `theme-base/CheckoutDeliveryMethod` в jsdom
 * (блок один на все пять тем). Лежит здесь, а не в `packages/theme-base/__tests__`:
 * тесты оттуда CI не запускает.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(
  __dirname,
  '..',
  '..',
  '..',
  'packages/theme-base/blocks/CheckoutDeliveryMethod/CheckoutDeliveryMethod.astro',
);
const SCRIPT = (() => {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(readFileSync(ASTRO, 'utf8'));
  if (!m) throw new Error('нет <script> в CheckoutDeliveryMethod.astro');
  return m[1];
})();

const SOFA = 'f7c592e2-3c85-4f39-bf1c-8a92266a0ea0';
const TOP = '7197322e-f2af-46bd-b02f-d80cd8e0ce73';
const OWN = { id: 'own1', name: '24 часа', type: 'OWN', price: 0 };

function mount(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="cdm-1"
             data-cdek-enabled="true" data-pickup-enabled="false" data-pickup-label="Самовывоз"
             data-free-shipping-threshold="">
      <div data-checkout-delivery-empty></div>
      <div data-checkout-delivery-loading hidden></div>
      <div data-checkout-delivery-error hidden></div>
      <div data-checkout-delivery-list hidden></div>
      <div data-cdek-pvz-picker hidden></div>
    </section>`;
  return document.querySelector('[data-checkout-delivery-method]') as HTMLElement;
}

let calcCalls = 0;
function answer(data: Record<string, unknown>) {
  calcCalls = 0;
  (window as any).fetch = jest.fn((url: string) => {
    if (/\/delivery\/calculate/.test(url)) calcCalls += 1;
    return Promise.resolve({ ok: true, json: async () => ({ success: true, data }) });
  });
}

const flush = () => new Promise((r) => setTimeout(r, 30));

/** Покупатель выбрал город — блок считает доставку. */
async function openWithAddress() {
  const section = mount();
  (window as any).__merfyRoot = () => section;
  // eslint-disable-next-line no-new-func
  new Function('blockId', SCRIPT)('cdm-1');
  document.dispatchEvent(
    new CustomEvent('checkout:address-changed', {
      detail: { cityFiasId: '0c5b2444-70a0-4932-980c-b4dc0d3f02b5', postalCode: '101000' },
    }),
  );
  await flush();
  await flush();
  const el = (sel: string) => section.querySelector(sel) as HTMLElement;
  return {
    error: el('[data-checkout-delivery-error]'),
    loading: el('[data-checkout-delivery-loading]'),
    list: el('[data-checkout-delivery-list]'),
  };
}

const shown = (el: HTMLElement) => !el.hidden;

describe('Чекаут: товар без доставки называется сразу', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('merfy:cartId', 'cart1');
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    (window as any).cartStore = {
      getTotal: () => 1250000,
      getItems: () => [
        { productId: SOFA, name: 'Модульный диван', quantity: 1 },
        { productId: TOP, productName: 'Топ с длинными рукавами', quantity: 1 },
      ],
    };
  });
  afterEach(() => {
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
    delete (window as any).cartStore;
  });

  it('один товар: имя в сообщении, без «Считаем…» и без повторов запроса', async () => {
    answer({ deliveryOptions: [], unavailableProducts: [{ productId: SOFA }] });

    const { error, loading, list } = await openWithAddress();

    expect({
      сообщение: shown(error) ? error.textContent : null,
      считаем: shown(loading),
      варианты: shown(list),
      запросов: calcCalls,
    }).toEqual({
      сообщение: '«Модульный диван» пока нельзя доставить. Уберите его из корзины, чтобы оформить заказ.',
      считаем: false,
      варианты: false,
      запросов: 1,
    });
  });

  it('несколько товаров — все по именам (имя и из name, и из productName)', async () => {
    answer({ deliveryOptions: [], unavailableProducts: [{ productId: SOFA }, { productId: TOP }] });

    const { error } = await openWithAddress();

    expect(error.textContent).toBe(
      'Эти товары пока нельзя доставить: «Модульный диван», «Топ с длинными рукавами». Уберите их из корзины, чтобы оформить заказ.',
    );
  });

  it('имя берётся и из локальной корзины темы, если серверной нет', async () => {
    (window as any).cartStore = { getTotal: () => 0, getItems: () => [] };
    localStorage.setItem('bloom:cart:v1', JSON.stringify([{ productId: SOFA, name: 'Модульный диван' }]));
    answer({ deliveryOptions: [], unavailableProducts: [{ productId: SOFA }] });

    const { error } = await openWithAddress();

    expect(error.textContent).toContain('«Модульный диван» пока нельзя доставить');
  });

  it('имени нет нигде — говорим без имени, но не про адрес', async () => {
    (window as any).cartStore = { getTotal: () => 0, getItems: () => [] };
    answer({ deliveryOptions: [], unavailableProducts: [{ productId: SOFA }] });

    const { error } = await openWithAddress();

    expect(error.textContent).toBe(
      'Один из товаров в корзине пока нельзя доставить. Уберите его, чтобы оформить заказ.',
    );
  });

  it('есть способы доставки — блок как раньше показывает их', async () => {
    answer({ deliveryOptions: [OWN], unavailableProducts: [{ productId: SOFA }] });

    const { error, list } = await openWithAddress();

    expect({ ошибка: shown(error), варианты: shown(list), карточек: list.children.length }).toEqual({
      ошибка: false,
      варианты: true,
      карточек: 1,
    });
  });
});
