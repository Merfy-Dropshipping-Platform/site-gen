/**
 * @jest-environment jsdom
 *
 * «В корзину» со страницы товара кладёт ТОТ вариант, что выделен на экране, —
 * с номером комбинации И названием. Проверяется исполнением: собственный скрипт
 * секции + общий делегат корзины, клик, строка в хранилище.
 *
 * Пункт 26 тестера (22.09, повтор 23.09: «ничего не поменялось»). Замер на
 * живом сайте владельца (bloom, тинт púsy): при сборке блок получил комбинации
 * в порядке «Sugar Plum, Berry Glaze, Cold Brew» и выделил Sugar Plum, а
 * `/data/products.json`, который читает скрипт страницы в браузере, отдал их в
 * порядке «Berry Glaze, Cold Brew, Sugar Plum» (сервис товаров не сортирует
 * комбинации, два запроса — два порядка). Скрипт, пока покупатель ничего не
 * нажимал, считал активной первую комбинацию МАССИВА и переписывал кнопку на
 * Berry Glaze, причём без названия. В корзине — пустая подпись и не тот
 * оттенок.
 *
 * Гард воспроизводит ровно это: сервер рисует из одного порядка, браузеру
 * отдаётся другой.
 */
import {
  createNtCart,
  type NtCartLine,
} from "../../../packages/theme-base/runtime/nt-cart";
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const КЛЮЧ = "t:cart:v1";

const комбо = (id: string, оттенок: string) => ({
  id,
  options: { Оттенок: оттенок },
  price: 910,
  compareAtPrice: null,
  available: true,
  quantity: 5,
});
const SP = комбо("c-sp", "Sugar Plum");
const BG = комбо("c-bg", "Berry Glaze");
const CB = комбо("c-cb", "Cold Brew");

const БАЗА = {
  id: "tint",
  name: "Тинт для губ",
  title: "Тинт для губ",
  slug: "tint",
  handle: "tint",
  image: "",
  images: [],
  price: 910,
  basePrice: 910,
  compareAtPrice: null,
  description: "",
  collectionIds: [],
  hasVariants: true,
  variantGroups: [
    {
      id: "g-1",
      name: "Оттенок",
      position: 0,
      options: [
        {
          id: "o-sp",
          value: "Sugar Plum",
          position: 0,
          images: [],
          swatchHex: null,
        },
        {
          id: "o-cb",
          value: "Cold Brew",
          position: 2,
          images: [],
          swatchHex: null,
        },
        {
          id: "o-bg",
          value: "Berry Glaze",
          position: 1,
          images: [],
          swatchHex: null,
        },
      ],
    },
  ],
};
/** Порядок, в котором комбинации получила сборка (и нарисовала чипы). */
const СЕРВЕР = { ...БАЗА, variantCombinations: [SP, BG, CB] };
/** Порядок `/data/products.json` в браузере — как на живом сайте 22.09. */
const БРАУЗЕР = { ...БАЗА, variantCombinations: [BG, CB, SP] };

function рендер(тема: string): string {
  const [r] = renderSections(
    тема,
    [
      {
        block: "Product",
        props: {
          id: "Product-1",
          productId: "tint",
          colorScheme: "scheme-1",
          siteId: "site-1",
        },
      },
    ],
    { MERFY_QA_STUB_PRODUCT: JSON.stringify(СЕРВЕР) },
  );
  if (r.error) throw new Error(`${тема}: ${r.error}`);
  return r.html ?? "";
}

const тик = () => new Promise((r) => setTimeout(r, 0));
async function дождаться(кадров = 20) {
  for (let i = 0; i < кадров; i++) await тик();
}

/** Куда скрипт страницы ходил за данными — доказательство, что он исполнился. */
const запросы: string[] = [];

beforeAll(() => {
  // Каталог в браузере — порядок БРАУЗЕР. Живой API и storefront-data молчат:
  // проверяем именно расхождение «сборка ↔ products.json».
  const fetchMock = jest.fn(async (url: unknown) => {
    const u = String(url);
    запросы.push(u);
    if (u.includes("products.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => [БРАУЗЕР],
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      json: async () => null,
    } as unknown as Response;
  });
  (window as unknown as { fetch: unknown }).fetch = fetchMock;
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  // Скрипты секции крутят requestAnimationFrame. Кадр, оставшийся после
  // разборки окружения, роняет ВЕСЬ процесс jest (jsdom читает
  // window.location у закрытого окна) — а гарды в CI идут пачкой в одном
  // процессе. Запоминаем кадры и снимаем их в afterAll.
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = raf((t) => {
      кадры.delete(id);
      cb(t);
    });
    кадры.add(id);
    return id;
  };
  // Общий делегат корзины — тот же, что у всех тем витрины.
  createNtCart({
    storageKey: КЛЮЧ,
    eventPrefix: "t:cart",
    renderDrawerItem: () => "",
  }).initCartUI();
});

const кадры = new Set<number>();
afterAll(() => {
  for (const id of кадры) window.cancelAnimationFrame(id);
  кадры.clear();
  document.body.innerHTML = "";
});

/**
 * Что видит покупатель: выделенные чипы/выбранные пункты списков. Разметки
 * две: theme-base — `data-variant-chip` + `data-variant-active`, flux —
 * `role="radio"` + `aria-checked` внутри `role="radiogroup"` с именем группы.
 */
function видимыйВыбор(): Record<string, string> {
  const out: Record<string, string> = {};
  document
    .querySelectorAll<HTMLElement>(
      '[data-variant-chip][data-variant-active="true"]',
    )
    .forEach((c) => {
      const k = c.getAttribute("data-variant-key");
      const v = c.getAttribute("data-variant-value");
      if (k && v && !(k in out)) out[k] = v;
    });
  document
    .querySelectorAll<HTMLElement>(
      '[role="radiogroup"] [role="radio"][aria-checked="true"][data-variant-value]',
    )
    .forEach((c) => {
      const k = c.closest('[role="radiogroup"]')?.getAttribute("aria-label");
      const v = c.getAttribute("data-variant-value");
      if (k && v && !(k in out)) out[k] = v;
    });
  document
    .querySelectorAll<HTMLSelectElement>("select[data-variant-select]")
    .forEach((s) => {
      const k = s.getAttribute("data-variant-key");
      if (k && s.value && !(k in out)) out[k] = s.value;
    });
  return out;
}

async function добавитьБезВыбора(тема: string): Promise<{
  строки: NtCartLine[];
  наЭкране: Record<string, string>;
  каталогДоКлика: boolean;
}> {
  // Скрипты секций «исполняются один раз на окно» — сбрасываем флаги, иначе
  // вторая тема молча не оживёт и проверка пройдёт на пустом месте.
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy"))
      delete (window as unknown as Record<string, unknown>)[k];
  }
  // Резолвер корня блока витрина получает в <head> (build.service) — без него
  // скрипт страницы товара падает на первой строке, и кнопка остаётся с
  // серверными данными: гард проходил бы, НЕ исполнив логику браузера
  // (поймано саботажем 23.09).

  (0, eval)(BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, ""));
  const html = рендер(тема);
  localStorage.clear();
  запросы.length = 0;
  const скрипты = [
    ...html.matchAll(
      /<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => m[1]);
  document.body.innerHTML = html.replace(
    /<script[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  for (const код of скрипты) {
    try {
      (0, eval)(код);
    } catch {
      /* чужие узлы (шапка, аналитика) в одиночном рендере не найдутся */
    }
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
  window.dispatchEvent(new Event("load"));
  await дождаться();

  const кнопка = [
    ...document.querySelectorAll<HTMLElement>("[data-add-to-cart]"),
  ].find((b) => !b.matches('[data-buy-now], [data-product-action="buy-now"]'));
  if (!кнопка)
    throw new Error(`${тема}: на странице товара нет кнопки «В корзину»`);
  const наЭкране = видимыйВыбор();
  // Скрипт страницы исполнился и сходил за каталогом ДО клика — иначе кнопка
  // несёт только серверные данные, и логика браузера не проверена.
  const каталогДоКлика = запросы.some((u) =>
    /products\.json|\/store\/products|storefront-data/.test(u),
  );
  кнопка.click();
  await дождаться();
  return {
    строки: JSON.parse(localStorage.getItem(КЛЮЧ) ?? "[]") as NtCartLine[],
    наЭкране,
    каталогДоКлика,
  };
}

describe("страница товара кладёт в корзину выделенный вариант", () => {
  for (const тема of ТЕМЫ) {
    it(`${тема}: без клика по варианту — выделенный на экране, с названием`, async () => {
      const { строки, наЭкране, каталогДоКлика } =
        await добавитьБезВыбора(тема);
      // Экран вообще показывает выбор — иначе сравнивать не с чем.
      expect({ тема, наЭкране }).toEqual({
        тема,
        наЭкране: { Оттенок: expect.any(String) },
      });
      expect({ тема, каталогДоКлика }).toEqual({ тема, каталогДоКлика: true });
      const ожидаемая = [SP, BG, CB].find(
        (c) => c.options.Оттенок === наЭкране.Оттенок,
      )!;

      expect(строки).toHaveLength(1);
      expect({
        тема,
        комбинация: строки[0].variant?.variantCombinationId,
        опции: строки[0].variant?.options,
      }).toEqual({
        тема,
        комбинация: ожидаемая.id,
        опции: { Оттенок: наЭкране.Оттенок },
      });
    });
  }
});
