/**
 * @jest-environment jsdom
 *
 * OrderConfirmation — ветка показа доставки внутри fillContent() инлайн-скрипта
 * (адрес [data-oc-address], способ [data-oc-delivery], стоимость
 * [data-oc-delivery-cost]). Скрипт помечен is:inline — исполняется через
 * astroInlineRunners (как в checkout-delivery-method.coverage.dom.test.ts),
 * покрытие пишется под путём OrderConfirmation.astro с его собственными
 * номерами строк.
 *
 * Spec 117, шаг 5.2: адрес и способ читают общие поля заказа (data-model.md §
 * orders) — pickupPointAddress/deliveryTariffName/deliveryCarrierName —
 * впереди старых cdekPickupPointAddress/cdekTariffName и синтетического
 * deliveryLabel сводки шлюза (contracts/http.md § витрина, шлюз пока не шлёт
 * deliveryCarrierName). Тот же принцип (общие поля первыми, сырой код не
 * показываем), что в runtime/order-delivery.ts для личного кабинета — но
 * is:inline не даёт импортировать TS-модуль напрямую (см. `mergeGiftLines` /
 * `GIFT_LINES_SOURCE` в runtime/gift-lines.ts, тот же приём для другого
 * рантайма), а набор полей сводки здесь свой (нет deliveryProfileName, есть
 * deliveryLabel) — поэтому логика продублирована в разметке is:inline, а не
 * вынесена в общую функцию.
 *
 * Фикстура покрывает и [data-oc-subtotal]/[data-oc-discount-row]/[data-oc-discount]
 * (добавлены в разметку вместе со статусом оплаты и скидкой заказа — вне ветки
 * доставки, не проверяются здесь): setText/q в fillContent() null-safe, без этих
 * узлов тест прошёл бы и так, но фикстура не отражала бы текущую разметку блока.
 * [data-oc-total-old] из старой разметки убран — fillContent() его больше не трогает.
 *
 * load() достаёт orderId из query (?orderId=), затем тянет данные заказа через
 * fetch(apiUrl + '/orders/:id/summary') и передаёт json.data в fillContent().
 * Здесь: history.pushState задаёт query, window.fetch — фейк с заданной
 * фикстурой { success: true, data }.
 */
import { join } from "path";
import { astroInlineRunners } from "./helpers/astro-inline-script";

const ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "OrderConfirmation",
  "OrderConfirmation.astro",
);

function mountDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="order-confirmation">
      <div data-oc-state hidden>
        <p data-oc-state-title></p>
        <p data-oc-state-text></p>
      </div>
      <div data-oc-content>
        <p data-oc-greeting></p>
        <p data-oc-number></p>
        <p data-oc-confirmed-title></p>
        <p data-oc-confirmed-note></p>
        <span data-oc-contact></span>
        <span data-oc-address></span>
        <span data-oc-delivery></span>
        <div data-oc-items></div>
        <span data-oc-subtotal></span>
        <div data-oc-discount-row hidden>
          <span data-oc-discount></span>
        </div>
        <span data-oc-delivery-cost></span>
        <span data-oc-total></span>
      </div>
    </section>`;
  return document.querySelector(
    '[data-block="order-confirmation"]',
  ) as HTMLElement;
}

async function tick(times = 6) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

let orderSeq = 0;

/**
 * Монтирует блок, подкладывает orderId в URL, отвечает на fetch фикстурой
 * `data` (как /orders/:id/summary) и ждёт, пока fillContent() отработает.
 */
async function renderDelivery(
  data: Record<string, unknown>,
): Promise<HTMLElement> {
  const section = mountDom();
  orderSeq += 1;
  history.pushState(null, "", `/order-confirmation?orderId=order-${orderSeq}`);
  (window as any).__merfyRoot = () => section;
  (window as any).fetch = jest.fn().mockResolvedValue({
    json: async () => ({ success: true, data }),
  });

  astroInlineRunners(ASTRO)[0].run({
    blockId: "oc-1",
    apiBase: "https://gateway.merfy.ru/api",
    greetingTpl: "Спасибо за заказ, {name}!",
    confTitle: "Ваш заказ подтверждён",
    confNote: "Скоро вы получите письмо.",
  });
  await tick();
  return section;
}

const text = (section: HTMLElement, sel: string) =>
  section.querySelector(sel)?.textContent;

describe("OrderConfirmation — ветка показа доставки (fillContent)", () => {
  afterEach(() => {
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    document.body.innerHTML = "";
  });

  describe("адрес — [data-oc-address]", () => {
    it("shippingAddress.fullAddress задан — показывается как есть, склейка частей игнорируется", async () => {
      const section = await renderDelivery({
        shippingAddress: {
          fullAddress: "Российская Федерация, г. Москва, ул. Пушкина, д. 5",
          country: "РФ",
          city: "Другой город",
          street: "Другая улица",
          building: "99",
        },
      });
      expect(text(section, "[data-oc-address]")).toBe(
        "Российская Федерация, г. Москва, ул. Пушкина, д. 5",
      );
    });

    it("fullAddress не задан, страна пропущена — склейка city/street/building через запятую, пропуск не оставляет пустого места", async () => {
      const section = await renderDelivery({
        shippingAddress: { city: "Москва", street: "Тверская", building: "1" },
      });
      expect(text(section, "[data-oc-address]")).toBe("Москва, Тверская, 1");
    });

    it("fullAddress не задан, заполнены только country+city (улица и дом пропущены) — склейка из двух частей", async () => {
      const section = await renderDelivery({
        shippingAddress: { country: "Россия", city: "Казань" },
      });
      expect(text(section, "[data-oc-address]")).toBe("Россия, Казань");
    });

    it('shippingAddress задан, но все части — пустые строки, ни pickupPointAddress, ни cdekPickupPointAddress нет — "—"', async () => {
      const section = await renderDelivery({
        shippingAddress: { country: "", city: "", street: "", building: "" },
      });
      expect(text(section, "[data-oc-address]")).toBe("—");
    });

    it("shippingAddress задан, но все части — пустые строки, ЕСТЬ cdekPickupPointAddress — используется адрес пункта выдачи", async () => {
      // ТЕКУЩЕЕ ПОВЕДЕНИЕ: shippingAddress с пустыми полями после
      // .filter(Boolean).join(', ') даёт '' (falsy) — OR-цепочка идёт дальше и
      // берёт pickupPointAddress/cdekPickupPointAddress, как будто shippingAddress
      // не было вовсе. OrderConfirmation.astro (fillContent, ветка addr).
      const section = await renderDelivery({
        shippingAddress: { country: "", city: "", street: "", building: "" },
        cdekPickupPointAddress: "ПВЗ №12, ул. Складская, 9",
      });
      expect(text(section, "[data-oc-address]")).toBe(
        "ПВЗ №12, ул. Складская, 9",
      );
    });

    it("shippingAddress отсутствует вовсе, есть cdekPickupPointAddress — показывается адрес пункта выдачи (старое поле, запасное)", async () => {
      const section = await renderDelivery({
        cdekPickupPointAddress: "Пункт самовывоза, просп. Мира, 3",
      });
      expect(text(section, "[data-oc-address]")).toBe(
        "Пункт самовывоза, просп. Мира, 3",
      );
    });

    it("shippingAddress отсутствует, есть общее pickupPointAddress (spec 117, шаг 5.2) — показывается оно", async () => {
      const section = await renderDelivery({
        pickupPointAddress: "ПВЗ №7, ул. Новая, 2",
      });
      expect(text(section, "[data-oc-address]")).toBe("ПВЗ №7, ул. Новая, 2");
    });

    it("заданы и pickupPointAddress, и старое cdekPickupPointAddress — общее поле побеждает (spec 117, шаг 5.2)", async () => {
      const section = await renderDelivery({
        pickupPointAddress: "Новый адрес пункта",
        cdekPickupPointAddress: "Старый адрес пункта",
      });
      expect(text(section, "[data-oc-address]")).toBe("Новый адрес пункта");
    });

    it('нет ни shippingAddress, ни pickupPointAddress, ни cdekPickupPointAddress — "—"', async () => {
      const section = await renderDelivery({});
      expect(text(section, "[data-oc-address]")).toBe("—");
    });
  });

  describe("способ доставки — [data-oc-delivery]", () => {
    it("deliveryTariffName (общее поле) задан — впереди старого cdekTariffName и deliveryLabel", async () => {
      const section = await renderDelivery({
        deliveryTariffName: "Посылка склад-дверь",
        cdekTariffName: "устаревшее имя",
        deliveryLabel: "Курьер СДЭК",
        deliveryType: "cdek_door",
      });
      expect(text(section, "[data-oc-delivery]")).toBe("Посылка склад-дверь");
    });

    it("deliveryTariffName нет, есть старое cdekTariffName — используется оно (запасное поле)", async () => {
      const section = await renderDelivery({
        cdekTariffName: "24 часа",
        deliveryType: "cdek_door",
      });
      expect(text(section, "[data-oc-delivery]")).toBe("24 часа");
    });

    it("ни одного тарифа нет, есть deliveryCarrierName — показывается имя перевозчика, для любого перевозчика", async () => {
      expect(
        text(
          await renderDelivery({ deliveryCarrierName: "СДЭК", deliveryType: "cdek_door" }),
          "[data-oc-delivery]",
        ),
      ).toBe("СДЭК");
      expect(
        text(
          await renderDelivery({ deliveryCarrierName: "ПЭК", deliveryType: "pek_door" }),
          "[data-oc-delivery]",
        ),
      ).toBe("ПЭК");
    });

    it('deliveryMode="self_pickup" — «Самовывоз» независимо от тарифа/перевозчика', async () => {
      const section = await renderDelivery({
        deliveryMode: "self_pickup",
        deliveryTariffName: "не должно показаться",
      });
      expect(text(section, "[data-oc-delivery]")).toBe("Самовывоз");
    });

    it("deliveryLabel задан и отличается от deliveryType — показывается ярлык (сегодняшняя сводка шлюза, поле уходит на шаге 7)", async () => {
      const section = await renderDelivery({
        deliveryLabel: "Курьер СДЭК",
        deliveryType: "cdek_door",
      });
      expect(text(section, "[data-oc-delivery]")).toBe("Курьер СДЭК");
    });

    it("deliveryLabel не задан, есть только deliveryType — общая подпись «Доставка», СЫРОЙ код больше не показывается", async () => {
      // ИЗМЕНИЛОСЬ (spec 117, шаг 5.2): раньше покупатель видел внутренний
      // идентификатор способа доставки как есть ('cdek_pickup') — то же
      // сомнительное поведение, которое до этого уже исправили в личном
      // кабинете (runtime/order-delivery.ts, owner 26.09). Теперь — то же
      // правило здесь: сырой код не показываем, общая подпись «Доставка».
      const section = await renderDelivery({ deliveryType: "cdek_pickup" });
      expect(text(section, "[data-oc-delivery]")).toBe("Доставка");
    });

    it("deliveryLabel равен deliveryType (сегодняшний фолбэк шлюза) — тоже считается сырым кодом, не названием", async () => {
      const section = await renderDelivery({
        deliveryLabel: "own_boxberry",
        deliveryType: "own_boxberry",
      });
      expect(text(section, "[data-oc-delivery]")).toBe("Доставка");
    });

    it('ни deliveryLabel, ни deliveryType не заданы — "—"', async () => {
      const section = await renderDelivery({});
      expect(text(section, "[data-oc-delivery]")).toBe("—");
    });
  });

  describe("стоимость — [data-oc-delivery-cost]", () => {
    it('deliveryCostCents = 0 — "Бесплатно"', async () => {
      const section = await renderDelivery({ deliveryCostCents: 0 });
      expect(text(section, "[data-oc-delivery-cost]")).toBe("Бесплатно");
    });

    it("deliveryCostCents > 0 — форматированная сумма (fmt через Intl ru-RU, NBSP перед ₽)", async () => {
      const section = await renderDelivery({ deliveryCostCents: 29900 });
      expect(text(section, "[data-oc-delivery-cost]")).toBe("299 ₽");
    });
  });
});
