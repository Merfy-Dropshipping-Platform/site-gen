/**
 * @jest-environment jsdom
 *
 * Кабинет покупателя — themes/<тема>/src/pages/account/order.astro, ветка показа
 * доставки (способ/адрес/срок) внутри initOrderPage(). Это НЕ is:inline-скрипт
 * (обычный модульный <script> с TypeScript-импортом ../../lib/auth), поэтому
 * astroInlineRunners его не исполняет (см. бриф задачи). Вместо этого: извлекаем
 * второй <script> файла, транспилируем typescript.transpileModule → CommonJS,
 * подставляем фейковый require(...) и исполняем через new Function.
 *
 * Способ/срок доставки переехали в общий packages/theme-base/runtime/order-delivery.ts
 * (владелец 26.09: заказ показывал «Способ доставки: custom» и «Дата доставки: —»);
 * товарные строки — в runtime/order-item.ts и runtime/gift-lines.ts (к доставке не
 * относятся, здесь не проверяются, но require на них тоже нужно обслужить — иначе
 * транспилированный модуль падает на "неожиданный require"). fakeRequire ниже
 * отдаёт РЕАЛЬНЫЕ реализации всех трёх (чистые функции без побочных эффектов,
 * импортированы обычным import) — только ../../lib/auth остаётся замоканным
 * (сетевые побочные эффекты).
 *
 * Строки доставки идентичны во всех пяти темах (проверено: единственное отличие
 * файлов — атрибут promo у <Layout> в rose/flux против его отсутствия в
 * vanilla/satin/bloom; относительный путь до runtime/order-delivery — тот же во
 * всех пяти). Параметризуем один и тот же набор фикстур по теме, чтобы
 * зафиксировать это явно и поймать будущий дрейф.
 */
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import {
  deliveryMethodLabel,
  deliveryPeriodLabel,
  deliveryTrackingNumber,
  deliveryTrackingUrl,
  customerMayCancelShipment,
} from "../runtime/order-delivery";
import { orderItemView } from "../runtime/order-item";
import { mergeGiftLines } from "../runtime/gift-lines";

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

function orderAstroPath(theme: string): string {
  return join(
    __dirname,
    "..",
    "..",
    "..",
    "themes",
    theme,
    "src",
    "pages",
    "account",
    "order.astro",
  );
}

/** Второй <script> файла — модульный (без is:inline), с логикой initOrderPage(). */
function extractModuleScript(src: string): string {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (!/\bis:inline\b/.test(m[1])) return m[2];
  }
  throw new Error("module <script> (без is:inline) не найден в order.astro");
}

function transpileToCjs(tsSource: string): string {
  return ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

interface AuthMock {
  navTo: jest.Mock;
  fetchOrder: jest.Mock;
  cancelOrder: jest.Mock;
  getToken: jest.Mock;
}

/**
 * Минимальная разметка страницы — элементы, которые трогает initOrderPage(),
 * плюс модалка отмены (order.astro рендерит её статически всегда — код после
 * `if (!canCancel) return;` обращается к её узлам без проверки на null).
 */
function mountOrderPageDom(): void {
  document.body.innerHTML = `
    <span id="order-subtitle"></span>
    <div id="order-loading"></div>
    <div id="order-not-found" class="hidden"></div>
    <div id="order-meta" class="hidden"></div>
    <div id="order-content" class="hidden">
      <div id="order-products"></div>
      <div id="order-info"></div>
    </div>
    <div id="cancel-modal" class="hidden">
      <div id="cancel-modal-overlay"></div>
      <textarea id="cancel-reason"></textarea>
      <p id="cancel-error" class="hidden"></p>
      <button id="btn-cancel-confirm" type="button"></button>
      <button id="btn-cancel-close" type="button"></button>
    </div>
  `;
}

/**
 * Исполняет initOrderPage() темы с фикстурой заказа и возвращает содержимое
 * блока "Способ доставки" / "Адрес доставки" / "Срок доставки" / "Отслеживание"
 * из #order-info (ярлык переименован вместе с переездом на
 * runtime/order-delivery.ts — было "Дата доставки"; ячейка ТЕПЕРЬ не
 * рендерится вовсе, когда deliveryPeriodLabel вернул пустую строку, — раньше
 * показывала "—", см. тесты ниже), а также текст кнопки «Отменить заказ»
 * (null, если кнопка не появилась — canCancel=false, spec 117 шаг 5.2).
 */
async function renderDeliveryInfo(
  theme: string,
  order: Record<string, unknown>,
) {
  mountOrderPageDom();
  history.pushState(null, "", "/account/order?n=1001");

  const authMock: AuthMock = {
    navTo: jest.fn(),
    fetchOrder: jest.fn().mockResolvedValue({
      success: true,
      data: {
        status: "delivered",
        orderNumber: "1001",
        createdAt: "2026-01-01",
        items: [],
        totalCents: 100000,
        ...order,
      },
    }),
    cancelOrder: jest.fn(),
    getToken: jest.fn().mockReturnValue("token-1"),
  };
  const fakeRequire = (spec: string) => {
    if (spec === "../../lib/auth") return authMock;
    if (spec === "../../../../../packages/theme-base/runtime/order-delivery") {
      return {
        deliveryMethodLabel,
        deliveryPeriodLabel,
        deliveryTrackingNumber,
        deliveryTrackingUrl,
        customerMayCancelShipment,
      };
    }
    if (spec === "../../../../../packages/theme-base/runtime/order-item") {
      return { orderItemView };
    }
    if (spec === "../../../../../packages/theme-base/runtime/gift-lines") {
      return { mergeGiftLines };
    }
    throw new Error("неожиданный require: " + spec);
  };

  const code = transpileToCjs(
    extractModuleScript(readFileSync(orderAstroPath(theme), "utf8")),
  );
  const factory = new Function("require", "exports", code);
  factory(fakeRequire, {});

  // initOrderPage() вызывается в конце скрипта синхронно (fire-and-forget), но
  // сама она async — ждём микрозадачи (fetchOrder + последующая синхронная сборка).
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  const infoEl = document.getElementById("order-info")!;
  const cell = (label: string) => {
    const cells = Array.from(infoEl.querySelectorAll(".account-info-cell"));
    const found = cells.find(
      (c) => c.querySelector(".info-label")?.textContent === label,
    );
    return found?.querySelector(".info-value") ?? null;
  };
  const trackingCell = cell("Отслеживание");
  const cancelBtn = document.body.querySelector("button.account-text-link");
  return {
    method: cell("Способ доставки")?.textContent ?? null,
    address: cell("Адрес доставки")?.textContent ?? null,
    period: cell("Срок доставки")?.textContent ?? null,
    tracking: trackingCell?.textContent ?? null,
    trackingLink: trackingCell?.querySelector("a")?.getAttribute("href") ?? null,
    cancelButton: cancelBtn?.textContent ?? null,
  };
}

describe.each(THEMES)(
  "Кабинет покупателя (%s) — order.astro, ветка показа доставки",
  (theme) => {
    it('deliveryType="pickup" (deliveryMode="self_pickup") → "Самовывоз"; pickupAddress подставляется в адрес (даже при наличии shippingAddress)', async () => {
      const result = await renderDeliveryInfo(theme, {
        deliveryType: "pickup",
        deliveryMode: "self_pickup",
        pickupAddress: "Магазин, ул. Складская, 1",
        shippingAddress: { city: "Москва", street: "Тверская", building: "1" },
        deliveryPeriodMin: 1,
        deliveryPeriodMax: 2,
      });
      expect(result.method).toBe("Самовывоз");
      expect(result.address).toBe("Магазин, ул. Складская, 1");
      // ИЗМЕНИЛОСЬ с переездом на runtime/order-delivery.ts: раньше всегда
      // буквально " дней" (min+'–'+max+' дней'); deliveryPeriodLabel() склоняет
      // по числу (dayWord) — hi=2 → "дня".
      expect(result.period).toBe("1–2 дня");
    });

    it.each(["cdek_door", "cdek_pickup"] as const)(
      'deliveryType=%s, deliveryCarrierName="СДЭК" (общее поле, заполнено переносом 2.1 у ЛЮБОГО заказа СДЭК) → "СДЭК"; адрес собирается из city+street+д.building',
      async (deliveryType) => {
        const result = await renderDeliveryInfo(theme, {
          deliveryType,
          deliveryCarrierName: "СДЭК",
          shippingAddress: {
            city: "Санкт-Петербург",
            street: "Невский проспект",
            building: "12",
          },
          deliveryPeriodMin: undefined,
          deliveryPeriodMax: undefined,
        });
        expect(result.method).toBe("СДЭК");
        expect(result.address).toBe("Санкт-Петербург, Невский проспект, д. 12");
        // ИЗМЕНИЛОСЬ с переездом на runtime/order-delivery.ts: раньше «оба не
        // заданы → "—"» (ячейка рендерилась с прочерком); deliveryPeriodLabel()
        // при отсутствии обоих краёв отдаёт '', и order.astro тогда НЕ рендерит
        // ячейку "Срок доставки" вовсе — cell() её не находит и возвращает null.
        expect(result.period).toBeNull();
      },
    );

    it('deliveryType="cdek_door", deliveryCarrierName="СДЭК" И deliveryProfileName заданы одновременно, тарифа нет — побеждает deliveryProfileName (приоритет: тариф → deliveryProfileName → перевозчик → общая подпись)', async () => {
      // Порядок в deliveryMethodLabel() (runtime/order-delivery.ts, spec 117 5.2):
      // deliveryTariffName → cdekTariffName → deliveryProfileName →
      // deliveryCarrierName → typeLabel(type). Без своего тарифа
      // deliveryProfileName (мерчантский профиль) побеждает даже над известным
      // именем перевозчика — не только над разбором сырого deliveryType.
      const result = await renderDeliveryInfo(theme, {
        deliveryType: "cdek_door",
        deliveryCarrierName: "СДЭК",
        deliveryProfileName: "Экспресс от партнёра",
        shippingAddress: { city: "Казань", street: "Баумана", building: "3" },
      });
      expect(result.method).toBe("Экспресс от партнёра");
    });

    it('deliveryProfileName задан (не pickup, не cdek) — побеждает над сырым deliveryType; building отсутствует → без "д."', async () => {
      const result = await renderDeliveryInfo(theme, {
        deliveryType: "custom_own",
        deliveryProfileName: "Экспресс от партнёра",
        shippingAddress: { city: "Казань", street: "Баумана", building: "" },
        deliveryPeriodMin: 2,
        deliveryPeriodMax: 4,
      });
      expect(result.method).toBe("Экспресс от партнёра");
      expect(result.address).toBe("Казань, Баумана"); // building пуст → отфильтрован, без "д."
      // ИЗМЕНИЛОСЬ: было буквально " дней" всегда; dayWord(4) → "дня".
      expect(result.period).toBe("2–4 дня");
    });

    it('нет deliveryProfileName/cdekTariffName — сырой deliveryType БОЛЬШЕ НЕ показывается, общая подпись "Доставка"; все части адреса пустые → "—"', async () => {
      // ИЗМЕНИЛОСЬ с переездом на runtime/order-delivery.ts: раньше order.astro
      // показывал order.deliveryType как есть ("own_boxberry" — сырой внутренний
      // код). typeLabel() в новом модуле сырой код больше не показывает (комментарий
      // в файле: «Сырой код не показываем») — для нераспознанного типа отдаёт
      // общую подпись "Доставка".
      const result = await renderDeliveryInfo(theme, {
        deliveryType: "own_boxberry",
        shippingAddress: { city: "", street: "", building: "" },
        deliveryPeriodMin: 2,
        deliveryPeriodMax: undefined, // только min задан
      });
      expect(result.method).toBe("Доставка");
      expect(result.address).toBe("—");
      // ИЗМЕНИЛОСЬ: раньше требовались ОБА края периода одновременно (2 && undefined
      // → falsy → "—"). deliveryPeriodLabel() выводит срок из ОДНОГО заданного края
      // (второй берётся равным первому) — единичный срок "2 дня", а не "—".
      expect(result.period).toBe("2 дня");
    });

    it('ни deliveryType, ни deliveryProfileName, ни shippingAddress не заданы — метод и адрес "—", срок не рендерится вовсе', async () => {
      const result = await renderDeliveryInfo(theme, {});
      expect(result.method).toBe("—");
      expect(result.address).toBe("—");
      // ИЗМЕНИЛОСЬ: пустой период → ячейка "Срок доставки" не рендерится (см. выше).
      expect(result.period).toBeNull();
    });

    describe("известные дефекты (ТЕКУЩЕЕ ПОВЕДЕНИЕ)", () => {
      it('deliveryType="pickup", но pickupAddress не задан — адрес берётся из shippingAddress (НЕ "—")', async () => {
        // ТЕКУЩЕЕ ПОВЕДЕНИЕ (сомнительно): при самовывозе, если pickupAddress не пришёл,
        // код показывает АДРЕС ДОСТАВКИ покупателя (shippingAddress), а не адрес точки
        // самовывоза и не "—" — потенциально вводит в заблуждение (для pickup-заказа
        // обычно нет доставки на дом). См. themes/<тема>/src/pages/account/order.astro,
        // строка "if (order.deliveryType === 'pickup' && order.pickupAddress) address = order.pickupAddress;"
        // — override срабатывает только если pickupAddress ПРАВДИВ; иначе остаётся
        // результат ветки shippingAddress выше по коду.
        const result = await renderDeliveryInfo(theme, {
          deliveryType: "pickup",
          shippingAddress: {
            city: "Санкт-Петербург",
            street: "Невский проспект",
            building: "12",
          },
        });
        expect(result.method).toBe("Самовывоз");
        expect(result.address).toBe("Санкт-Петербург, Невский проспект, д. 12");
      });
    });

    describe("пункт выдачи перевозчика — общее поле (spec 117, шаг 5.2)", () => {
      it("нет shippingAddress, есть pickupPointAddress (общее) — показывается адрес пункта выдачи", async () => {
        const result = await renderDeliveryInfo(theme, {
          deliveryType: "cdek_pickup",
          pickupPointAddress: "ПВЗ №12, ул. Складская, 9",
        });
        expect(result.address).toBe("ПВЗ №12, ул. Складская, 9");
      });

      it("нет shippingAddress, только старое cdekPickupPointAddress — тоже показывается (запасное поле)", async () => {
        const result = await renderDeliveryInfo(theme, {
          deliveryType: "cdek_pickup",
          cdekPickupPointAddress: "Пункт самовывоза, просп. Мира, 3",
        });
        expect(result.address).toBe("Пункт самовывоза, просп. Мира, 3");
      });

      it("заданы оба — общее pickupPointAddress побеждает старое cdekPickupPointAddress", async () => {
        const result = await renderDeliveryInfo(theme, {
          deliveryType: "cdek_pickup",
          pickupPointAddress: "Новый адрес пункта",
          cdekPickupPointAddress: "Старый адрес пункта",
        });
        expect(result.address).toBe("Новый адрес пункта");
      });

      it("shippingAddress уже даёт непустой адрес — пункт выдачи его не перекрывает", async () => {
        const result = await renderDeliveryInfo(theme, {
          deliveryType: "cdek_door",
          shippingAddress: { city: "Москва", street: "Тверская", building: "1" },
          pickupPointAddress: "ПВЗ, который не должен показаться",
        });
        expect(result.address).toBe("Москва, Тверская, д. 1");
      });
    });

    describe("отслеживание — общие поля trackingNumber/trackingUrl (spec 117, шаг 5.2)", () => {
      it("trackingNumber и trackingUrl заданы — номер показан ссылкой на trackingUrl", async () => {
        const result = await renderDeliveryInfo(theme, {
          status: "processing",
          trackingNumber: "1234567890",
          trackingUrl: "https://www.cdek.ru/ru/tracking?order_id=1234567890",
        });
        expect(result.tracking).toBe("1234567890");
        expect(result.trackingLink).toBe(
          "https://www.cdek.ru/ru/tracking?order_id=1234567890",
        );
      });

      it("только trackingNumber, ссылки нет — номер показан обычным текстом, без ссылки", async () => {
        const result = await renderDeliveryInfo(theme, {
          status: "processing",
          trackingNumber: "1234567890",
        });
        expect(result.tracking).toBe("1234567890");
        expect(result.trackingLink).toBeNull();
      });

      it("нет trackingNumber, есть старый cdekNumber — показывается он (запасное поле)", async () => {
        const result = await renderDeliveryInfo(theme, {
          status: "processing",
          cdekNumber: "0987654321",
        });
        expect(result.tracking).toBe("0987654321");
      });

      it("ни trackingNumber, ни cdekNumber не заданы — ячейка «Отслеживание» не рендерится вовсе", async () => {
        const result = await renderDeliveryInfo(theme, { status: "processing" });
        expect(result.tracking).toBeNull();
      });
    });

    describe("кнопка «Отменить заказ» — по shipmentCancellable (spec 117, шаг 5.2, решение владельца 29.09)", () => {
      it("status=paid, shipmentCancellable=true — кнопка показана", async () => {
        const result = await renderDeliveryInfo(theme, {
          status: "paid",
          shipmentCancellable: true,
          deliveryStatus: "IN_TRANSIT", // даже «в пути» — перевозчик явно разрешил
        });
        expect(result.cancelButton).toBe("Отменить заказ");
      });

      it("status=paid, shipmentCancellable=false — кнопки нет, даже если по старому статусу было бы можно", async () => {
        const result = await renderDeliveryInfo(theme, {
          status: "paid",
          shipmentCancellable: false,
          deliveryStatus: "CREATED",
        });
        expect(result.cancelButton).toBeNull();
      });

      it("shipmentCancellable не пришёл (undefined) — решает статус отправления: CREATED можно, IN_TRANSIT нельзя", async () => {
        const created = await renderDeliveryInfo(theme, {
          status: "processing",
          deliveryStatus: "CREATED",
        });
        expect(created.cancelButton).toBe("Отменить заказ");

        const inTransit = await renderDeliveryInfo(theme, {
          status: "processing",
          deliveryStatus: "IN_TRANSIT",
        });
        expect(inTransit.cancelButton).toBeNull();
      });

      it("ни shipmentCancellable, ни deliveryStatus не заданы — можно (как раньше, до передачи перевозчику)", async () => {
        const result = await renderDeliveryInfo(theme, { status: "paid" });
        expect(result.cancelButton).toBe("Отменить заказ");
      });

      it("status=delivered — кнопки нет независимо от shipmentCancellable (стадия заказа решает первой)", async () => {
        const result = await renderDeliveryInfo(theme, {
          status: "delivered",
          shipmentCancellable: true,
        });
        expect(result.cancelButton).toBeNull();
      });
    });
  },
);
