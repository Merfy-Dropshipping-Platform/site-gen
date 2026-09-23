/**
 * @jest-environment jsdom
 *
 * «Каталог товаров» → «Следующее фото при наведении»: наведение на карточку
 * показывает второе фото товара, уход — возвращает первое. Так ведут себя
 * rose, satin и flux; bloom и vanilla листают все фото по положению курсора
 * (владелец 23.09) — это сторожит `catalog-next-photo-by-theme.spec.ts`.
 *
 * Панель показывает эту настройку во всех пяти темах, а vanilla её не читала
 * вовсе: аудит 22.09 — ноль упоминаний в порте против 8–14 у остальных, то есть
 * переключатель в vanilla ничего не делал. Нашлось при разборе скриншотов
 * «Группы товаров», которые прислал владелец.
 *
 * Карточки каталога рисует СКРИПТ гидрации, в серверной разметке их нет —
 * проверка по хешу разметки здесь ничего не доказывает (поймано 22.09: регэксп
 * «класса кнопки» находил шаблон `${_cartBtnCls}` в тексте скрипта). Поэтому
 * скрипт исполняется в jsdom на подложенном ответе витринного API.
 */
import { renderSections } from "../../../scripts/qa/lib/render";

const ТЕМЫ = ["rose", "satin", "flux"] as const;
const ФОТО_1 = "https://minio.merfy.ru/product-images/one.jpg";
const ФОТО_2 = "https://minio.merfy.ru/product-images/two.jpg";

const ОТВЕТ_API = {
  products: [
    {
      id: "p-1",
      title: "Товар с двумя фото",
      handle: "tovar",
      images: [ФОТО_1, ФОТО_2],
      basePrice: "100000",
      hasVariants: false,
      variantCombinations: [],
      productCollections: [],
    },
  ],
  total: 1,
  pagination: { totalPages: 1 },
};

function сбросОкна(): void {
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy"))
      delete (window as unknown as Record<string, unknown>)[k];
  }
  for (const a of [...document.body.getAttributeNames()])
    document.body.removeAttribute(a);
  document.body.innerHTML = "";
}

async function нарисоватьКаталог(
  тема: string,
  nextPhoto: "true" | "false",
): Promise<HTMLImageElement | null> {
  сбросОкна();
  const [строка] = renderSections(тема, [
    {
      block: "Catalog",
      props: {
        id: "Catalog-1",
        colorScheme: "scheme-1",
        productCard: { nextPhoto, quickAdd: "none" },
      },
    },
  ]);
  const html = строка?.html ?? "";
  (window as unknown as Record<string, unknown>).__MERFY_SITE_ID__ = "site-1";
  (window as unknown as Record<string, unknown>).__MERFY_API_BASE__ =
    "https://gateway.test";
  (window as unknown as { fetch: unknown }).fetch = async (url: string) => {
    const тело = String(url).includes("/api/store/products") ? ОТВЕТ_API : [];
    return {
      ok: true,
      status: 200,
      json: async () => тело,
      text: async () => JSON.stringify(тело),
    };
  };
  const скрипты = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  document.body.innerHTML = html.replace(
    /<script[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  for (const код of скрипты) {
    try {
      // eslint-disable-next-line no-eval
      (0, eval)(код);
    } catch {
      /* чужие куски страницы без своих узлов */
    }
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
  for (let i = 0; i < 20; i++) {
    const img = document.querySelector<HTMLImageElement>(
      `[data-nt="catalog-grid"] img[src="${ФОТО_1}"]`,
    );
    if (img) return img;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

describe("«Следующее фото при наведении» в каталоге", () => {
  for (const тема of ТЕМЫ) {
    it(`${тема}: наведение показывает второе фото, уход — возвращает первое`, async () => {
      const img = await нарисоватьКаталог(тема, "true");
      // Карточка из ответа API вообще нарисована — иначе проверка ниже пустая.
      expect(img).not.toBeNull();
      img!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(img!.getAttribute("src")).toBe(ФОТО_2);
      img!.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      expect(img!.getAttribute("src")).toBe(ФОТО_1);
    });

    it(`${тема}: выключенная настройка фото не меняет`, async () => {
      const img = await нарисоватьКаталог(тема, "false");
      expect(img).not.toBeNull();
      img!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(img!.getAttribute("src")).toBe(ФОТО_1);
    });
  }
});
