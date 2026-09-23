/**
 * @jest-environment jsdom
 *
 * «Продолжить покупки» в пустой корзине ведёт на «общую» коллекцию магазина.
 *
 * Владелец 23.09: «при пустой корзине кнопка ведёт на страницу хз какую, а
 * должна вести на страницу коллекции общей». Прод-замер: bloom — `/skin-care`
 * («Уход за кожей», заглушка вёрстки), vanilla — `/catalog/textile`
 * («Текстиль», заглушка), rose/satin/flux и выдвижная корзина — `/catalog`.
 *
 * «Общая» — коллекция магазина по умолчанию (`isDefault`); мерчант может её
 * переименовать (у тестировщика «Товары», `/collections/tovary`, а
 * `/collections/general` там 404). Адрес находит общий модуль
 * packages/theme-base/runtime/continue-shopping.ts по витринному API — по
 * намерению покупателя (навёл, фокус, касание, нажатие): кнопка есть в
 * выдвижной корзине на каждой странице, запрос на каждый просмотр был бы
 * лишним. Не нашлось — запасной `/catalog` из разметки.
 *
 * Нажатие без наведения (телефон) модуль придерживает до адреса. На ту же
 * ссылку претендуют ещё двое, и оба сверены с живым кодом:
 *  - роутер Astro (ViewTransitions у bloom/rose/vanilla; бандл ClientRouter
 *    живой витрины) — слушает на document при всплытии из <head>, то есть
 *    раньше модуля, и уходит по ещё не найденному адресу; ссылки с
 *    `data-astro-reload` он пропускает — атрибут стоит на кнопке;
 *  - перехватчик превью конструктора (preview.service,
 *    PREVIEW_NAV_AGENT_INLINE) — в конце <body>, при захвате: отменяет
 *    нажатие и переключает страницу конструктора. Модуль тогда ничего не
 *    делает, иначе увёл бы iframe превью.
 *
 * Проверка — настоящий рендер «Корзины» и «Секции корзины» пяти тем, их
 * скрипты в jsdom (модуль витрины вшит в скрипт страницы), подменённое API.
 * Выдвижные корзины (общая и vanilla) и старые страницы cart.astro живут в
 * раскладке, не в секции, — для них сверка исходника.
 *
 * Требует сборки: pnpm build:theme-sections:all
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ТЕМЫ,
  type Магазин,
  дождаться,
  запросыКоллекций,
  показатьБлок,
  поставитьСтенд,
  снять,
} from "./lib/catalog-dom";

jest.setTimeout(60_000);
beforeAll(() => поставитьСтенд());
afterAll(() => снять());

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const БЛОКИ = ["CartBody", "CartSection"] as const;

/** «Общая» переименована — как у тестировщика. */
const С_ОБЩЕЙ: Магазин = {
  коллекции: [
    {
      id: "c1",
      title: "Автомобильная коллекция",
      slug: "avto",
      isDefault: false,
    },
    { id: "c2", title: "Товары", slug: "tovary", isDefault: true },
  ],
};
const БЕЗ_ОБЩЕЙ: Магазин = {
  коллекции: [{ id: "c1", title: "Лето", slug: "leto", isDefault: false }],
};

const кнопки = (корень: HTMLElement) =>
  [...корень.querySelectorAll("a")].filter((a) =>
    /Продолжить покупки/.test(a.textContent ?? ""),
  );

async function показатьКорзину(
  тема: (typeof ТЕМЫ)[number],
  блок: string,
  м: Магазин,
): Promise<HTMLAnchorElement[]> {
  (window as unknown as Record<string, unknown>).__MERFY_SITE_ID__ = "site-1";
  const корень = await показатьБлок(тема, блок, {}, true, м);
  await дождаться();
  const все = кнопки(корень);
  if (все.length === 0)
    throw new Error(`${тема} ${блок}: нет кнопки «Продолжить покупки»`);
  return все;
}

/** Покупатель навёл на кнопку. */
async function навести(кнопка: Element): Promise<void> {
  кнопка.dispatchEvent(new Event("pointerover", { bubbles: true }));
  await дождаться();
}

/**
 * Нажать без наведения. Переходы считаются по ошибкам jsdom: переходить по
 * адресу он не умеет и сообщает о каждой попытке.
 */
async function нажатьСразу(кнопка: Element): Promise<{ переходов: number }> {
  const ошибки = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    кнопка.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await дождаться();
    const переходов = ошибки.mock.calls.filter((c) =>
      /navigation/.test(String((c[0] as Error)?.message ?? c[0])),
    ).length;
    return { переходов };
  } finally {
    ошибки.mockRestore();
  }
}

/** Ссылка, по которой нажали, если нажатие ещё никто не отменил. */
const свободнаяСсылка = (ev: Event) =>
  ev.defaultPrevented
    ? null
    : (ev.target as Element).closest<HTMLAnchorElement>("a[href]");

describe.each(ТЕМЫ)("«Продолжить покупки» пустой корзины — %s", (тема) => {
  describe.each(БЛОКИ)("%s", (блок) => {
    it("без намерения покупателя — ни одного запроса, запасной /catalog с меткой", async () => {
      const все = await показатьКорзину(тема, блок, С_ОБЩЕЙ);
      expect({
        запросов: запросыКоллекций.length,
        метка: все.map((a) => a.hasAttribute("data-continue-shopping")),
        адрес: все.map((a) => a.getAttribute("href")),
      }).toEqual({
        запросов: 0,
        метка: все.map(() => true),
        адрес: все.map(() => "/catalog"),
      });
    });

    it("навёл — ведёт на «общую» коллекцию (переименованную тоже)", async () => {
      const все = await показатьКорзину(тема, блок, С_ОБЩЕЙ);
      await навести(все[0]);
      expect({
        запросов: запросыКоллекций.length,
        адрес: все.map((a) => a.getAttribute("href")),
      }).toEqual({ запросов: 1, адрес: все.map(() => "/collections/tovary") });
    });

    it("нажал сразу, не наводя, — переход ждёт адрес «общей», роутер Astro его не перебивает", async () => {
      // Роутер Astro — как в бандле ClientRouter живой витрины: из <head>
      // (раньше секции), на document при всплытии; пропускает ссылки с
      // data-astro-reload и отменённые нажатия, остальные уводит сам. Слушатель
      // вешается мимо учёта стенда, чтобы снять() при показе его не убрал.
      const роутер: string[] = [];
      const astro = (ev: Event) => {
        const a = свободнаяСсылка(ev);
        if (!a || a.dataset.astroReload !== undefined) return;
        ev.preventDefault();
        роутер.push(a.getAttribute("href") ?? "");
      };
      EventTarget.prototype.addEventListener.call(document, "click", astro);
      try {
        const все = await показатьКорзину(тема, блок, С_ОБЩЕЙ);
        const { переходов } = await нажатьСразу(все[0]);
        expect({
          роутер,
          переходов,
          запросов: запросыКоллекций.length,
          адрес: все[0].getAttribute("href"),
        }).toEqual({
          роутер: [],
          переходов: 1,
          запросов: 1,
          адрес: "/collections/tovary",
        });
      } finally {
        EventTarget.prototype.removeEventListener.call(
          document,
          "click",
          astro,
        );
      }
    });

    it("в превью конструктора нажатие уходит конструктору — сама витрина не переходит", async () => {
      const все = await показатьКорзину(тема, блок, С_ОБЩЕЙ);
      // Перехватчик превью — после скриптов секций, при захвате: отменяет
      // нажатие на ссылку и просит конструктор переключить страницу.
      const конструктор: string[] = [];
      document.addEventListener(
        "click",
        (ev) => {
          const a = свободнаяСсылка(ev);
          if (!a) return;
          ev.preventDefault();
          конструктор.push(a.getAttribute("href") ?? "");
        },
        true,
      );
      const { переходов } = await нажатьСразу(все[0]);
      expect({ конструктор, переходов }).toEqual({
        конструктор: ["/catalog"],
        переходов: 0,
      });
    });

    it("«общей» не нашлось — остаётся запасной /catalog, не заглушка вёрстки", async () => {
      const все = await показатьКорзину(тема, блок, БЕЗ_ОБЩЕЙ);
      await навести(все[0]);
      expect(все.map((a) => a.getAttribute("href"))).toEqual(
        все.map(() => "/catalog"),
      );
    });
  });
});

describe("кнопки вне секций: выдвижные корзины, старые страницы корзины", () => {
  const ФАЙЛЫ = [
    "packages/theme-base/primitives/SchemeCartDrawer.astro",
    "themes/vanilla/src/components/VanillaCartDrawer.astro",
    "themes/bloom/src/pages/cart.astro",
    "themes/satin/src/pages/cart.astro",
  ];

  it.each(ФАЙЛЫ)(
    "%s: кнопка с меткой и data-astro-reload, модуль подключён",
    (файл) => {
      const код = readFileSync(resolve(SITES_ROOT, файл), "utf-8");
      const кнопка = /<a\b[^>]*>\s*Продолжить покупки/.exec(код)?.[0] ?? "";
      expect({
        метка: кнопка.includes("data-continue-shopping"),
        роутерМимо: кнопка.includes("data-astro-reload"),
        модуль:
          /import \{ bindContinueShopping \} from "[^"]*runtime\/continue-shopping"/.test(
            код,
          ),
        заглушка: /\/skin-care|\/catalog\/textile/.test(кнопка),
      }).toEqual({
        метка: true,
        роутерМимо: true,
        модуль: true,
        заглушка: false,
      });
    },
  );
});
