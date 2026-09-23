/**
 * @jest-environment jsdom
 *
 * «Продолжить покупки» в пустой корзине ведёт на «общую» коллекцию магазина.
 *
 * Владелец 23.09: «при пустой корзине кнопка ведёт на страницу хз какую, а
 * должна вести на страницу коллекции общей». Прод-замер: bloom — `/skin-care`
 * («Уход за кожей», заглушка вёрстки), vanilla — `/catalog/textile`
 * («Текстиль», заглушка), rose/satin/flux — `/catalog`.
 *
 * «Общая» — коллекция магазина по умолчанию (`isDefault`); мерчант может её
 * переименовать (у тестировщика «Товары», `/collections/tovary`, а
 * `/collections/general` там 404). Адрес находит общий модуль
 * packages/theme-base/runtime/continue-shopping.ts: сначала файл сайта
 * `/data/collections.json` (публикация кладёт туда `isDefault`), потом
 * витринное API; нет ни того, ни другого — остаётся запасной `/catalog`.
 *
 * Проверка — настоящий рендер «Корзины» и «Секции корзины» пяти тем, их
 * скрипты в jsdom (модуль витрины вшит в скрипт страницы), подменённые файл
 * сайта и API. Выдвижная корзина vanilla и старые страницы cart.astro живут в
 * раскладке, не в секции, — для них сверка исходника: метка на кнопке и
 * подключённый модуль.
 *
 * Требует сборки: pnpm build:theme-sections:all
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ТЕМЫ,
  type Магазин,
  дождаться,
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
const ФАЙЛ_САЙТА = [
  { id: "c1", name: "Автомобильная коллекция", slug: "avto", isDefault: false },
  { id: "c2", name: "Товары", slug: "tovary", isDefault: true },
];
const API: Магазин["коллекции"] = [
  { id: "c1", title: "Лето", slug: "leto", isDefault: false },
  { id: "c2", title: "Общая", slug: "general", isDefault: true },
];

const кнопки = (корень: HTMLElement) =>
  [...корень.querySelectorAll("a")].filter((a) =>
    /Продолжить покупки/.test(a.textContent ?? ""),
  );

async function адреса(
  тема: (typeof ТЕМЫ)[number],
  блок: string,
  м: Магазин,
): Promise<{ метка: boolean[]; адрес: string[] }> {
  (window as unknown as Record<string, unknown>).__MERFY_SITE_ID__ = "site-1";
  const корень = await показатьБлок(тема, блок, {}, true, м);
  await дождаться();
  const все = кнопки(корень);
  if (все.length === 0)
    throw new Error(`${тема} ${блок}: нет кнопки «Продолжить покупки»`);
  return {
    метка: все.map((a) => a.hasAttribute("data-continue-shopping")),
    адрес: все.map((a) => a.getAttribute("href") ?? ""),
  };
}

describe.each(ТЕМЫ)("«Продолжить покупки» пустой корзины — %s", (тема) => {
  describe.each(БЛОКИ)("%s", (блок) => {
    it("ведёт на «общую» коллекцию из файла сайта (переименованную тоже)", async () => {
      const r = await адреса(тема, блок, { файлКоллекций: ФАЙЛ_САЙТА });
      expect(r).toEqual({
        метка: r.метка.map(() => true),
        адрес: r.адрес.map(() => "/collections/tovary"),
      });
    });

    it("файла сайта нет — адрес из витринного API", async () => {
      const r = await адреса(тема, блок, { коллекции: API });
      expect(r.адрес).toEqual(r.адрес.map(() => "/collections/general"));
    });

    it("«общей» не нашлось — остаётся запасной /catalog, не заглушка вёрстки", async () => {
      const r = await адреса(тема, блок, {});
      expect(r.адрес).toEqual(r.адрес.map(() => "/catalog"));
    });
  });
});

describe("кнопки вне секций: выдвижная корзина vanilla, старые страницы корзины", () => {
  const ФАЙЛЫ = [
    "themes/vanilla/src/components/VanillaCartDrawer.astro",
    "themes/bloom/src/pages/cart.astro",
    "themes/satin/src/pages/cart.astro",
  ];

  it.each(ФАЙЛЫ)("%s: кнопка с меткой и модуль подключён", (файл) => {
    const код = readFileSync(resolve(SITES_ROOT, файл), "utf-8");
    const кнопка = /<a\b[^>]*>\s*Продолжить покупки/.exec(код)?.[0] ?? "";
    expect({
      метка: кнопка.includes("data-continue-shopping"),
      модуль:
        /import \{ bindContinueShopping \} from "[^"]*runtime\/continue-shopping"/.test(
          код,
        ),
      заглушка: /\/skin-care|\/catalog\/textile/.test(кнопка),
    }).toEqual({ метка: true, модуль: true, заглушка: false });
  });
});
