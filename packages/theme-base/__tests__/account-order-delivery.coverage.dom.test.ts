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

/** Минимальная разметка страницы — только элементы, которые трогает initOrderPage(). */
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
  `;
}

/**
 * Исполняет initOrderPage() темы с фикстурой заказа и возвращает содержимое
 * блока "Способ доставки" / "Адрес доставки" / "Срок доставки" из #order-info
 * (ярлык переименован вместе с переездом на runtime/order-delivery.ts — было
 * "Дата доставки"; ячейка ТЕПЕРЬ не рендерится вовсе, когда deliveryPeriodLabel
 * вернул пустую строку, — раньше показывала "—", см. тесты ниже).
 * order.status='delivered' — canCancel=false (кнопка отмены и её разметка вне
 * объёма этой ветки, поэтому не монтируем #cancel-modal и не проверяем её).
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
      return { deliveryMethodLabel, deliveryPeriodLabel };
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
    return found?.querySelector(".info-value")?.textContent ?? null;
  };
  return {
    method: cell("Способ доставки"),
    address: cell("Адрес доставки"),
    period: cell("Срок доставки"),
  };
}

describe.each(THEMES)(
  "Кабинет покупателя (%s) — order.astro, ветка показа доставки",
  (theme) => {
    it('deliveryType="pickup" → "Самовывоз"; pickupAddress подставляется в адрес (даже при наличии shippingAddress)', async () => {
      const result = await renderDeliveryInfo(theme, {
        deliveryType: "pickup",
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
      'deliveryType=%s (содержит "cdek") → "СДЭК"; адрес собирается из city+street+д.building',
      async (deliveryType) => {
        const result = await renderDeliveryInfo(theme, {
          deliveryType,
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

    it('deliveryType="cdek_door" И deliveryProfileName заданы одновременно, cdekTariffName НЕ задан — теперь побеждает deliveryProfileName (приоритет изменился с переездом на runtime/order-delivery.ts)', async () => {
      // ИЗМЕНИЛОСЬ: раньше order.astro сам проверял order.deliveryType.includes('cdek')
      // ДО deliveryProfileName — побеждала "СДЭК". Новый deliveryMethodLabel()
      // (runtime/order-delivery.ts) считает в порядке cdekTariffName →
      // deliveryProfileName → typeLabel(type); typeLabel распознаёт "cdek" по
      // подстроке типа ТОЛЬКО когда ни то, ни другое не задано — проверка типа
      // на "cdek" теперь ПОСЛЕ deliveryProfileName, а не до неё.
      const result = await renderDeliveryInfo(theme, {
        deliveryType: "cdek_door",
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
  },
);
