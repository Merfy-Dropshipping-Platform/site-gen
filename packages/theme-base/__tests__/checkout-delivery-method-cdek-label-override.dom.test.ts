/**
 * @jest-environment jsdom
 *
 * Правка после 5.1 (спека 117): 458 сайтов на проде хранят в ревизии
 * `CheckoutDeliveryMethod` свой текст `cdekDoorLabel`/`cdekPvzLabel`/
 * `cdekPostamatLabel` (например «Курьер до двери» вместо дефолта «Курьер
 * СДЭК до двери») — владелец «интерфейс не меняем», FR-013 спеки требует,
 * чтобы эти настройки продолжали работать как замена подписи расчёта.
 *
 * Проверяем:
 *  - carrier==='cdek': заданный непустой пропс побеждает label из расчёта;
 *  - пустая строка в пропсе — старое поведение до 5.1 (`"" || 'дефолт'`),
 *    НЕ то же самое что «пропс не задан»;
 *  - пропс не передан вовсе (атрибута нет в DOM) — используется label из
 *    расчёта, как у любого другого перевозчика;
 *  - carrier!=='cdek' (ПЭК): cdek*-пропсы ни на что не влияют, только label
 *    из расчёта;
 *  - cdekEnabled===false — как и до 5.1, не фильтрует cdek-варианты (в
 *    скрипте до 5.1 этот атрибут вообще не читался, см. WORKLOG 2026-09-30).
 *
 * Скрипт извлекается из .astro и исполняется через astroInlineRunners —
 * покрытие пишется под путём CheckoutDeliveryMethod.astro.
 */
import { join } from 'path';
import { astroInlineRunners } from './helpers/astro-inline-script';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutDeliveryMethod', 'CheckoutDeliveryMethod.astro');

/** cdekAttrs=null → атрибуты cdek-door/pvz/postamat-label вовсе не рисуются в DOM
 * (имитирует Astro.props без этих ключей); строка — конкретное значение атрибута
 * (включая пустую строку). cdekEnabled — как есть строкой ('true'/'false') или
 * null, если атрибут тоже не нужен. */
function mountDom(opts: {
  cdekEnabled?: string | null;
  cdekDoorLabel?: string | null;
  cdekPvzLabel?: string | null;
  cdekPostamatLabel?: string | null;
} = {}): HTMLElement {
  const attr = (name: string, val: string | null | undefined) =>
    val === null || val === undefined ? '' : ` ${name}="${val}"`;
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="cdm-1"
             data-pickup-enabled="false" data-pickup-label="Самовывоз"
             data-free-shipping-threshold=""${attr('data-cdek-enabled', opts.cdekEnabled)}${attr('data-cdek-door-label', opts.cdekDoorLabel)}${attr('data-cdek-pvz-label', opts.cdekPvzLabel)}${attr('data-cdek-postamat-label', opts.cdekPostamatLabel)}>
      <div data-checkout-delivery-empty></div>
      <div data-checkout-delivery-loading hidden></div>
      <div data-checkout-delivery-error hidden></div>
      <div data-checkout-delivery-list hidden></div>
      <div data-cdek-pvz-picker hidden></div>
    </section>`;
  return document.querySelector('[data-checkout-delivery-method]') as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  astroInlineRunners(ASTRO)[0].run({ blockId: 'cdm-1' });
}

async function flush(ms = 30) {
  await new Promise((r) => setTimeout(r, ms));
}

const CDEK_DOOR_OPTION = {
  id: 'o1', name: 'x', type: 'PARTNER', price: 350, minDays: 1, maxDays: 3, description: '',
  carrier: 'cdek', mode: 'door', tariffCode: '137', requiresPickupPoint: false, shipmentRequired: true,
  label: 'Курьер СДЭК до двери', // готовая подпись из расчёта (манифест СДЭК)
};
const CDEK_PVZ_OPTION = {
  id: 'o2', name: 'x', type: 'PARTNER', price: 300, minDays: 2, maxDays: 5, description: '',
  carrier: 'cdek', mode: 'pickup', pickupPointKind: 'PVZ', tariffCode: '138', requiresPickupPoint: true, shipmentRequired: true,
  label: 'Пункт выдачи СДЭК',
};
const PEK_DOOR_OPTION = {
  id: 'o3', name: 'x', type: 'PARTNER', price: 400, minDays: 2, maxDays: 4, description: '',
  carrier: 'pek', mode: 'door', tariffCode: '12', requiresPickupPoint: false, shipmentRequired: true,
  label: 'Курьер ПЭК до двери',
};

function mockCalc(deliveryOptions: unknown[]) {
  (window as any).fetch = jest.fn((url: string) => {
    if (/pickup-points/.test(url)) return Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
    if (/delivery\/calculate/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { deliveryOptions, pickupPoints: [] } }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

async function renderWith(section: HTMLElement) {
  runScript(section);
  section.setAttribute('data-last-fias-id', 'fias1');
  document.dispatchEvent(new CustomEvent('checkout:address-changed', { detail: { cityFiasId: 'fias1', postalCode: '101000' } }));
  await flush();
  await flush();
  return section.querySelector('[data-checkout-delivery-list]') as HTMLElement;
}

function labelOf(list: HTMLElement, type: string): string {
  const card = list.querySelector(`[data-delivery-type="${type}"] [data-delivery-label]`);
  return card ? card.textContent || '' : '<нет карточки>';
}

describe('CheckoutDeliveryMethod — подпись СДЭК из настроек блока (правка после 117/5.1)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('merfy:cartId', 'cart1');
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    (window as any).cartStore = { getTotal: () => 100000 };
  });
  afterEach(() => {
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
    delete (window as any).cartStore;
  });

  it('пропс задан непустой строкой — побеждает label из расчёта (кейс 458 сайтов: «Курьер до двери»)', async () => {
    mockCalc([CDEK_DOOR_OPTION]);
    const list = await renderWith(mountDom({ cdekDoorLabel: 'Курьер до двери', cdekPvzLabel: 'До пункта выдачи' }));
    expect(labelOf(list, 'cdek_door')).toBe('Курьер до двери');
  });

  it('ПВЗ: пропс задан непустой строкой — тоже побеждает label из расчёта', async () => {
    mockCalc([CDEK_PVZ_OPTION]);
    const list = await renderWith(mountDom({ cdekPvzLabel: 'До пункта выдачи' }));
    expect(labelOf(list, 'cdek_pickup')).toBe('До пункта выдачи');
  });

  it('пропс задан пустой строкой — дефолт «Курьер СДЭК до двери» (поведение до 5.1: "" || \'текст\'), не пустая подпись', async () => {
    mockCalc([CDEK_DOOR_OPTION]);
    const list = await renderWith(mountDom({ cdekDoorLabel: '' }));
    expect(labelOf(list, 'cdek_door')).toBe('Курьер СДЭК до двери');
  });

  it('постамат: пропс задан пустой строкой — дефолт «Постамат СДЭК»', async () => {
    mockCalc([{ ...CDEK_PVZ_OPTION, pickupPointKind: 'POSTAMAT', label: 'Постамат СДЭК' }]);
    const list = await renderWith(mountDom({ cdekPostamatLabel: '' }));
    expect(labelOf(list, 'cdek_pickup')).toBe('Постамат СДЭК');
  });

  it('пропс не передан вовсе (атрибута нет в DOM) — используется label из расчёта', async () => {
    mockCalc([CDEK_DOOR_OPTION]);
    const list = await renderWith(mountDom({ cdekDoorLabel: null }));
    expect(labelOf(list, 'cdek_door')).toBe('Курьер СДЭК до двери');
  });

  it('ПЭК: cdek*-пропсы ни на что не влияют — подпись только из расчёта, даже если cdekDoorLabel задан другим текстом', async () => {
    mockCalc([PEK_DOOR_OPTION]);
    const list = await renderWith(mountDom({ cdekDoorLabel: 'Курьер до двери' }));
    expect(labelOf(list, 'pek_door')).toBe('Курьер ПЭК до двери');
  });

  it('cdekEnabled=false — как и до 5.1, не прячет cdek-варианты (атрибут не проверяется скриптом)', async () => {
    mockCalc([CDEK_DOOR_OPTION]);
    const list = await renderWith(mountDom({ cdekEnabled: 'false', cdekDoorLabel: 'Курьер до двери' }));
    expect(list.querySelector('[data-delivery-type="cdek_door"]')).not.toBeNull();
    expect(labelOf(list, 'cdek_door')).toBe('Курьер до двери');
  });
});
