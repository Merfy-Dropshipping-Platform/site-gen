/**
 * @jest-environment jsdom
 *
 * «Группа товаров» → «Следующее фото при наведении» ведёт себя ОДИНАКОВО во
 * всех пяти темах и слушается «Режима следующего фото».
 *
 * Владелец, 23.09: «в некоторых темах работает по-разному: скролл (bloom,
 * vanilla), остальное — следующее фото (второе). Скролл — как в Авито: водишь
 * курсором по фото, и фотки перелистываются слева направо». Режим — настройка
 * панели («Просто следующее» / «Зоны при наведении»). До правки rose и vanilla
 * зон не умели вовсе, а bloom брал режим с первого элемента страницы, у
 * которого такой атрибут есть, а не со своей секции.
 *
 * Проверка исполняет собственный скрипт каталога каждой темы на подложенном
 * ответе API (товары по 4 фото) и водит мышью по фото настоящими событиями.
 */
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const ФОТО = ["/f0.jpg", "/f1.jpg", "/f2.jpg", "/f3.jpg"];

const товар = (i: number) => ({
  id: `p-${i}`,
  name: `Товар ${i}`,
  title: `Товар ${i}`,
  slug: `p-${i}`,
  handle: `p-${i}`,
  price: 1000 + i,
  basePrice: 1000 + i,
  images: ФОТО.map((f) => `${f}?${i}`),
  image: `${ФОТО[0]}?${i}`,
  hasVariants: false,
  variantCombinations: [],
  variantGroups: [],
  collectionIds: [],
});
const ТОВАРЫ = [товар(1), товар(2)];

const тик = () => new Promise((r) => setTimeout(r, 0));

/** Слушатели, которые скрипт повесил на document/window, — чтобы снять их. */
type Слушатель = {
  цель: EventTarget;
  тип: string;
  fn: EventListenerOrEventListenerObject;
  opts?: unknown;
};
const повешенные: Слушатель[] = [];
const origDoc = document.addEventListener.bind(document);
const origWin = window.addEventListener.bind(window);

beforeAll(() => {
  document.addEventListener = ((
    тип: string,
    fn: EventListenerOrEventListenerObject,
    opts?: unknown,
  ) => {
    повешенные.push({ цель: document, тип, fn, opts });
    origDoc(тип, fn, opts as AddEventListenerOptions);
  }) as typeof document.addEventListener;
  window.addEventListener = ((
    тип: string,
    fn: EventListenerOrEventListenerObject,
    opts?: unknown,
  ) => {
    повешенные.push({ цель: window, тип, fn, opts });
    origWin(тип, fn, opts as AddEventListenerOptions);
  }) as typeof window.addEventListener;
  const ответ = (u: string) =>
    /products/.test(u)
      ? {
          data: ТОВАРЫ,
          products: ТОВАРЫ,
          items: ТОВАРЫ,
          total: ТОВАРЫ.length,
          meta: { total: ТОВАРЫ.length },
        }
      : { data: [], items: [], collections: [] };
  const fetchMock = jest.fn(async (url: unknown) => {
    const body = ответ(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  (window as unknown as { fetch: unknown }).fetch = fetchMock;
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

function снятьСлушатели() {
  for (const s of повешенные.splice(0))
    s.цель.removeEventListener(s.тип, s.fn, s.opts as EventListenerOptions);
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy"))
      delete (window as unknown as Record<string, unknown>)[k];
  }
  for (const a of Array.from(document.body.attributes))
    document.body.removeAttribute(a.name);
  document.body.innerHTML = "";
}

async function картинка(
  тема: string,
  режим: "simple" | "zones",
): Promise<HTMLImageElement> {
  снятьСлушатели();
  (0, eval)(BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, ""));
  const [r] = renderSections(тема, [
    {
      block: "Catalog",
      props: {
        id: "Catalog-1",
        siteId: "site-1",
        colorScheme: "scheme-1",
        cards: 8,
        columns: 3,
        showFilter: "false",
        showSort: "false",
        productCard: {
          nextPhoto: "true",
          nextPhotoMode: режим,
          quickAdd: "none",
        },
      },
    },
  ]);
  if (r.error) throw new Error(`${тема}: ${r.error}`);
  const html = r.html ?? "";
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
      /* чужие узлы одиночного рендера */
    }
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
  window.dispatchEvent(new Event("load"));
  for (let i = 0; i < 30; i++) await тик();
  const img = document.querySelector<HTMLImageElement>(
    '[data-nt="catalog-grid"] img[data-img-primary]',
  );
  if (!img) throw new Error(`${тема}: в сетке нет карточки с фото`);
  img.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  return img;
}

const мышь = (img: Element, тип: string, x = 50) =>
  img.dispatchEvent(
    new MouseEvent(тип, { bubbles: true, clientX: x, clientY: 50 }),
  );
const фото = (img: HTMLImageElement) =>
  (img.getAttribute("src") ?? "").replace(/\?.*$/, "");

afterAll(() => снятьСлушатели());

describe("«Следующее фото при наведении» — одинаково во всех темах", () => {
  for (const тема of ТЕМЫ) {
    it(`${тема}: «Просто следующее» — второе фото при наведении, назад при уходе`, async () => {
      const img = await картинка(тема, "simple");
      мышь(img, "mouseover");
      const наведено = фото(img);
      мышь(img, "mouseout");
      expect({ тема, наведено, ушли: фото(img) }).toEqual({
        тема,
        наведено: ФОТО[1],
        ушли: ФОТО[0],
      });
    });

    it(`${тема}: «Зоны при наведении» — фото по положению курсора, как в Авито`, async () => {
      const img = await картинка(тема, "zones");
      const поX = (x: number) => {
        мышь(img, "mouseover", x);
        мышь(img, "mousemove", x);
        return фото(img);
      };
      const слева = поX(10);
      const вторая = поX(40);
      const справа = поX(95);
      мышь(img, "mouseout", 95);
      expect({ тема, слева, вторая, справа, ушли: фото(img) }).toEqual({
        тема,
        слева: ФОТО[0],
        вторая: ФОТО[1],
        справа: ФОТО[3],
        ушли: ФОТО[0],
      });
    });
  }
});
