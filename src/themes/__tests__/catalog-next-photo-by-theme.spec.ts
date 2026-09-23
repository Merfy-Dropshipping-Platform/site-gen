/**
 * @jest-environment jsdom
 *
 * «Группа товаров» → «Следующее фото при наведении» — ровно тем путём, каким
 * идёт тестировщик: включил переключатель, больше ничего не трогал, водит мышью
 * по фото карточки.
 *
 * Владелец, 23.09: «скролл при наведении не работает там, где он должен —
 * bloom и vanilla. Как в Авито: наводишь в начало — первая фотка, на середину —
 * вторая, в конец — третья, по соотношению количества фоток». Остальные темы
 * (rose, satin, flux) показывают второе фото — это сторожит
 * `catalog-next-photo-hover.spec.ts`.
 *
 * Прошлый сторож этого места проверял МОЁ прочтение пункта (порты слушаются
 * «Режима следующего фото», подложенного в пропы), а не то, что видит тестер:
 * выбора режима в конструкторе нет вовсе, у bloom тема по умолчанию ставила
 * «Просто следующее», у vanilla режим молча выходил тем же. Все пять тем были
 * зелёными, а листания у тестера не было нигде. Поэтому здесь:
 *  - в пропах только то, что пишет панель: переключатель плюс то, что лежит в
 *    ревизиях после старых дефолтов (`nextPhotoMode` нет / 'simple' / 'zones'),
 *    и тема обязана вести себя одинаково при любом из них;
 *  - у товара пять фото — больше прежнего потолка в четыре;
 *  - ширина полос считается по видимой рамке фото (родитель с overflow-hidden),
 *    а не по картинке, которую наведение увеличивает на 5%.
 *
 * Скрипт каталога исполняется в jsdom на подложенном ответе витринного API,
 * мышь — настоящими событиями.
 */
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const ЛИСТАЮТ = ["bloom", "vanilla"] as const;
const ВСЕ_ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
/** Что лежит в ревизиях: ничего, дефолт bloom/flux до 23.09, случайное «zones». */
const СОХРАНЁННЫЙ_РЕЖИМ = [undefined, "simple", "zones"] as const;

const фотоТовара = (сколько: number) =>
  Array.from({ length: сколько }, (_, i) => `/f${i}.jpg`);

const товар = (фото: string[]) => ({
  id: "p-1",
  name: "Товар",
  title: "Товар",
  slug: "p-1",
  handle: "p-1",
  price: 1000,
  basePrice: 1000,
  images: фото,
  image: фото[0],
  hasVariants: false,
  variantCombinations: [],
  variantGroups: [],
  collectionIds: [],
});

let ТОВАРЫ: ReturnType<typeof товар>[] = [];
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
  const fetchMock = jest.fn(async (url: unknown) => {
    const body = /products/.test(String(url))
      ? {
          data: ТОВАРЫ,
          products: ТОВАРЫ,
          items: ТОВАРЫ,
          total: ТОВАРЫ.length,
          meta: { total: ТОВАРЫ.length },
        }
      : { data: [], items: [], collections: [] };
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
afterAll(() => снятьСлушатели());

/**
 * Карточка каталога после гидрации; видимая рамка фото — 0…100 px.
 * `новаяСтраница: false` — перерисовка блока в превью конструктора после правки
 * в сайдбаре: слушатели, флажки на body и глобалы остаются от прошлого показа.
 */
async function карточка(
  тема: string,
  фото: string[],
  productCard: Record<string, unknown>,
  новаяСтраница = true,
): Promise<HTMLImageElement> {
  if (новаяСтраница) {
    снятьСлушатели();
    (0, eval)(BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, ""));
  }
  ТОВАРЫ = [товар(фото)];
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
        productCard: { quickAdd: "none", ...productCard },
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
  if (!img?.parentElement)
    throw new Error(`${тема}: в сетке нет карточки с фото`);
  img.parentElement.getBoundingClientRect = () =>
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

const фотоСейчас = (img: HTMLImageElement) => img.getAttribute("src");

/** Навести курсор на точку x (px) видимой рамки и вернуть показанное фото. */
function навести(img: HTMLImageElement, x: number): string | null {
  img.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: 50 }),
  );
  img.dispatchEvent(
    new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: 50 }),
  );
  return фотоСейчас(img);
}

function увести(img: HTMLImageElement): string | null {
  img.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  return фотоСейчас(img);
}

describe("«Следующее фото при наведении»: bloom и vanilla листают, как на Авито", () => {
  for (const тема of ЛИСТАЮТ) {
    for (const режим of СОХРАНЁННЫЙ_РЕЖИМ) {
      const подпись = режим
        ? `в ревизии режим «${режим}»`
        : "режима в ревизии нет";

      it(`${тема}, ${подпись}: три фото — треть рамки на фото, уход — первое`, async () => {
        const img = await карточка(тема, фотоТовара(3), {
          nextPhoto: "true",
          ...(режим ? { nextPhotoMode: режим } : {}),
        });
        expect({
          тема,
          начало: навести(img, 10),
          середина: навести(img, 50),
          конец: навести(img, 90),
          ушли: увести(img),
        }).toEqual({
          тема,
          начало: "/f0.jpg",
          середина: "/f1.jpg",
          конец: "/f2.jpg",
          ушли: "/f0.jpg",
        });
      });

      it(`${тема}, ${подпись}: пять фото — листаются все, без потолка в четыре`, async () => {
        const img = await карточка(тема, фотоТовара(5), {
          nextPhoto: "true",
          ...(режим ? { nextPhotoMode: режим } : {}),
        });
        // Полосы по 20 px: 19 — ещё первое фото (по увеличенной картинке было
        // бы уже второе), 50 — третье, 99 — пятое.
        expect({
          тема,
          x19: навести(img, 19),
          x50: навести(img, 50),
          x99: навести(img, 99),
        }).toEqual({ тема, x19: "/f0.jpg", x50: "/f2.jpg", x99: "/f4.jpg" });
      });
    }
  }
});

/**
 * Путь тестера в конструкторе: превью открыто с выключенным переключателем,
 * тестер включает «Следующее фото», блок перерисовывается без перезагрузки.
 * У rose, flux и bloom наведение привязывалось под общим флажком карточки,
 * который ставился ещё при первом показе, — после включения в конструкторе фото
 * не менялось вовсе (прод-замер 23.09 на стенде bloom: пять точек — «фото 1»).
 */
const ПОСЛЕ_ВКЛЮЧЕНИЯ: Record<string, [string, string, string]> = {
  bloom: ["/f0.jpg", "/f1.jpg", "/f2.jpg"],
  vanilla: ["/f0.jpg", "/f1.jpg", "/f2.jpg"],
  rose: ["/f1.jpg", "/f1.jpg", "/f1.jpg"],
  satin: ["/f1.jpg", "/f1.jpg", "/f1.jpg"],
  flux: ["/f1.jpg", "/f1.jpg", "/f1.jpg"],
};

describe("«Следующее фото»: включили в конструкторе — работает без перезагрузки превью", () => {
  for (const тема of ВСЕ_ТЕМЫ) {
    it(`${тема}: сначала выключено, потом включено`, async () => {
      await карточка(тема, фотоТовара(3), { nextPhoto: "false" });
      const img = await карточка(
        тема,
        фотоТовара(3),
        { nextPhoto: "true" },
        false,
      );
      expect({
        тема,
        точки: [навести(img, 10), навести(img, 50), навести(img, 90)],
      }).toEqual({ тема, точки: ПОСЛЕ_ВКЛЮЧЕНИЯ[тема] });
    });
  }
});

describe("«Следующее фото при наведении»: сохранённый режим не переключает тему", () => {
  for (const тема of ВСЕ_ТЕМЫ) {
    it(`${тема}: выключено — фото не меняется ни при каком курсоре`, async () => {
      const img = await карточка(тема, фотоТовара(3), { nextPhoto: "false" });
      expect({ тема, x50: навести(img, 50), x90: навести(img, 90) }).toEqual({
        тема,
        x50: "/f0.jpg",
        x90: "/f0.jpg",
      });
    });
  }

  for (const тема of ВСЕ_ТЕМЫ.filter((t) => !ЛИСТАЮТ.includes(t as never))) {
    it(`${тема}: «zones» в ревизии — всё равно второе фото, а не листание`, async () => {
      const img = await карточка(тема, фотоТовара(5), {
        nextPhoto: "true",
        nextPhotoMode: "zones",
      });
      expect({ тема, x10: навести(img, 10), x99: навести(img, 99) }).toEqual({
        тема,
        x10: "/f1.jpg",
        x99: "/f1.jpg",
      });
    });
  }
});
