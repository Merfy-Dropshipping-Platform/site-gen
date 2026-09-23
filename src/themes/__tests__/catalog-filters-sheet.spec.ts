/**
 * @jest-environment jsdom
 *
 * «Фильтры и сортировка» на телефоне — шторка по вёрстке всех пяти тем.
 *
 * Владелец, 23.09: «адаптив мобилы взять с вёрстки». Верстальщики 17.09 сделали
 * во всех пяти темах одно и то же (Bloom/Satin/Flux/Rose/VanillaFiltersSheet +
 * lib/filters-sheet.ts): на узком экране кнопка «Фильтры и сортировка», по ней —
 * шторка под шапкой с фильтрами и сортировкой, внизу «Показать» и «Закрыть».
 * У нас так было только в rose (18.09, и то с другим содержимым), у bloom,
 * satin, flux и vanilla на телефоне стояла строка выпадашек прямо на странице.
 * 18.09 владелец уже просил «адаптив фильтров и сортировки взять из rose» —
 * тогда сделали одну тему из пяти.
 *
 * Проверки — от лица покупателя, по всем пяти темам, со своим скриптом каталога
 * и шторки (jsdom, в CI браузера нет):
 *   • на телефоне одна кнопка «Фильтры и сортировка», шторка закрыта;
 *   • в шторке — фильтры и сортировка: у bloom/satin/flux/rose та же строка,
 *     что на десктопе (один DOM, как в вёрстке), у vanilla — сайдбар;
 *   • нажал кнопку — шторка открыта, прокрутка заперта на <html>;
 *   • «Закрыть», «Показать» и Esc закрывают и снимают замок;
 *   • «Фильтры» и «Сортировка» выключены — ни кнопки, ни шторки;
 *   • блок перерисован в конструкторе при открытой шторке — замок снят;
 *   • с какой ширины шторки нет — как в вёрстке темы (md или lg).
 *
 * Положение под шапкой и `display: contents` на десктопе jsdom не видит — это
 * замер в Chromium (локальная сцена scripts/qa/lib/stage.ts, 5 тем × 390/900/
 * 1280, и прод-стенды), см. WORKLOG 23.09.
 */
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

type Тема = "bloom" | "satin" | "flux" | "rose" | "vanilla";

/** Как в вёрстке: где кончается телефон и что шторка делает на десктопе. */
const ВЁРСТКА: Record<
  Тема,
  { кнопкаНаДесктопе: string; шторкаНаДесктопе: string; внутри: string }
> = {
  bloom: {
    кнопкаНаДесктопе: "md:hidden",
    шторкаНаДесктопе: "md:contents!",
    внутри: '[data-nt="catalog-filters"]',
  },
  satin: {
    кнопкаНаДесктопе: "md:hidden",
    шторкаНаДесктопе: "md:contents!",
    внутри: '[data-nt="catalog-filters"]',
  },
  flux: {
    кнопкаНаДесктопе: "md:hidden",
    шторкаНаДесктопе: "md:contents!",
    внутри: '[data-nt="catalog-filters"]',
  },
  rose: {
    кнопкаНаДесктопе: "lg:hidden",
    шторкаНаДесктопе: "lg:contents!",
    внутри: '[data-nt="catalog-filters"]',
  },
  // У vanilla в шторке сайдбар, а раскладок у нас две: на десктопе шторка
  // прячется целиком, сайдбар «Сбоку» — свой.
  vanilla: {
    кнопкаНаДесктопе: "lg:hidden",
    шторкаНаДесктопе: "lg:hidden!",
    внутри: '[data-nt="filter-sidebar"]',
  },
};
const ТЕМЫ = Object.keys(ВЁРСТКА) as Тема[];

const тик = () => new Promise((r) => setTimeout(r, 0));

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
  const fetchMock = jest.fn(async () => {
    const body = {
      data: [],
      items: [],
      products: [],
      total: 0,
      collections: [],
    };
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

function снять() {
  for (const s of повешенные.splice(0))
    s.цель.removeEventListener(s.тип, s.fn, s.opts as EventListenerOptions);
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy"))
      delete (window as unknown as Record<string, unknown>)[k];
  }
  for (const a of Array.from(document.body.attributes))
    document.body.removeAttribute(a.name);
  document.documentElement.style.overflow = "";
  document.body.innerHTML = "";
}
afterAll(() => снять());

/**
 * Показать секцию «Группа товаров» темы. `новаяСтраница: false` — перерисовка
 * блока в превью конструктора: слушатели, флажки и глобалы остаются.
 */
async function показать(
  тема: Тема,
  props: Record<string, unknown> = {},
  новаяСтраница = true,
): Promise<HTMLElement> {
  if (новаяСтраница) {
    снять();
    (0, eval)(BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, ""));
  }
  const [r] = renderSections(тема, [
    {
      block: "Catalog",
      props: {
        id: "Catalog-1",
        siteId: "site-1",
        colorScheme: "scheme-1",
        cards: 4,
        columns: 2,
        showFilter: "true",
        showSort: "true",
        filterPosition: "top",
        ...props,
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
  for (let i = 0; i < 20; i++) await тик();
  const корень = document.querySelector<HTMLElement>(
    '[data-puck-component-id="Catalog-1"]',
  );
  if (!корень) throw new Error(`${тема}: нет корня секции`);
  return корень;
}

const нажать = (el: Element | null) =>
  el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const шторкаОткрыта = (корень: HTMLElement) =>
  !корень.querySelector("[data-filters-sheet]")?.classList.contains("hidden");
const замок = () => document.documentElement.style.overflow || "нет";

describe.each(ТЕМЫ)("«Фильтры и сортировка» на телефоне — %s", (тема) => {
  const вёрстка = ВЁРСТКА[тема];

  it("одна кнопка «Фильтры и сортировка», шторка закрыта", async () => {
    const корень = await показать(тема);
    const кнопки = корень.querySelectorAll("[data-filters-open]");
    const шторка = корень.querySelector("[data-filters-sheet]");
    expect({
      кнопок: кнопки.length,
      текст: (кнопки[0]?.textContent ?? "").replace(/\s+/g, " ").trim(),
      управляет: кнопки[0]?.getAttribute("aria-controls") === шторка?.id,
      закрыта: шторка?.classList.contains("hidden"),
      диалог: шторка?.getAttribute("role"),
    }).toEqual({
      кнопок: 1,
      текст: expect.stringContaining("Фильтры и сортировка"),
      управляет: true,
      закрыта: true,
      диалог: "dialog",
    });
  });

  it("в шторке фильтры, сортировка и «Показать» / «Закрыть»", async () => {
    const корень = await показать(тема);
    const шторка = корень.querySelector("[data-filters-sheet]")!;
    const текст = (шторка.textContent ?? "").replace(/\s+/g, " ");
    expect({
      содержимое: !!шторка.querySelector(вёрстка.внутри),
      наличие: /Наличие/i.test(текст),
      стоимость: /Стоимость/i.test(текст),
      сортировка: /популярности|Сортировать|новизне/i.test(текст),
      показать: шторка.querySelectorAll("[data-filters-apply]").length,
      закрыть: [...шторка.querySelectorAll("[data-filters-close]")].some((b) =>
        /Закрыть/.test(b.textContent ?? ""),
      ),
    }).toEqual({
      содержимое: true,
      наличие: true,
      стоимость: true,
      сортировка: true,
      показать: 1,
      закрыть: true,
    });
  });

  if (вёрстка.внутри === '[data-nt="catalog-filters"]') {
    it("строка фильтров одна — в шторке та же, что на десктопе", async () => {
      const корень = await показать(тема);
      const строки = корень.querySelectorAll('[data-nt="catalog-filters"]');
      expect({
        строк: строки.length,
        вШторке: !!строки[0]?.closest("[data-filters-sheet]"),
      }).toEqual({ строк: 1, вШторке: true });
    });
  } else {
    it("радио сайдбара в шторке не сливаются с радио остальной секции", async () => {
      const корень = await показать(тема);
      const шторка = корень.querySelector("[data-filters-sheet]")!;
      const имена = (где: Iterable<Element>) =>
        new Set(
          [...где]
            .filter((i) => (i as HTMLInputElement).type === "radio")
            .map((i) => i.getAttribute("name")),
        );
      const внутри = имена(шторка.querySelectorAll("input"));
      const снаружи = имена(
        [...корень.querySelectorAll("input")].filter(
          (i) => !шторка.contains(i),
        ),
      );
      expect({
        радиоВШторке: внутри.size > 0,
        общих: [...внутри].filter((n) => снаружи.has(n)),
      }).toEqual({ радиоВШторке: true, общих: [] });
    });
  }

  it("нажал кнопку — открыта и прокрутка заперта; «Закрыть» — закрыта и отперта", async () => {
    const корень = await показать(тема);
    нажать(корень.querySelector("[data-filters-open]"));
    const открыли = {
      открыта: шторкаОткрыта(корень),
      замок: замок(),
      развёрнута: корень
        .querySelector("[data-filters-open]")
        ?.getAttribute("aria-expanded"),
    };
    const закрыть = [
      ...корень.querySelectorAll("[data-filters-sheet] [data-filters-close]"),
    ].find((b) => /Закрыть/.test(b.textContent ?? ""));
    нажать(закрыть ?? null);
    expect({
      открыли,
      закрыли: { открыта: шторкаОткрыта(корень), замок: замок() },
    }).toEqual({
      открыли: { открыта: true, замок: "hidden", развёрнута: "true" },
      закрыли: { открыта: false, замок: "нет" },
    });
  });

  it("«Показать» и Esc тоже закрывают", async () => {
    const корень = await показать(тема);
    нажать(корень.querySelector("[data-filters-open]"));
    нажать(корень.querySelector("[data-filters-apply]"));
    const послеПоказать = { открыта: шторкаОткрыта(корень), замок: замок() };
    нажать(корень.querySelector("[data-filters-open]"));
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect({
      послеПоказать,
      послеEsc: { открыта: шторкаОткрыта(корень), замок: замок() },
    }).toEqual({
      послеПоказать: { открыта: false, замок: "нет" },
      послеEsc: { открыта: false, замок: "нет" },
    });
  });

  it("«Фильтры» и «Сортировка» выключены — ни кнопки, ни шторки", async () => {
    const корень = await показать(тема, {
      showFilter: "false",
      showSort: "false",
    });
    expect({
      кнопок: корень.querySelectorAll("[data-filters-open]").length,
      шторок: корень.querySelectorAll("[data-filters-sheet]").length,
    }).toEqual({ кнопок: 0, шторок: 0 });
  });

  it("блок перерисован в конструкторе при открытой шторке — замок снят", async () => {
    const корень = await показать(тема);
    нажать(корень.querySelector("[data-filters-open]"));
    const доПерерисовки = замок();
    await показать(тема, { cards: 6 }, false);
    expect({ доПерерисовки, после: замок() }).toEqual({
      доПерерисовки: "hidden",
      после: "нет",
    });
  });

  it("с какой ширины шторки нет — как в вёрстке темы", async () => {
    const корень = await показать(тема);
    const кнопка = корень.querySelector("[data-filters-open]")!;
    const шторка = корень.querySelector("[data-filters-sheet]")!;
    expect({
      кнопка: кнопка.classList.contains(вёрстка.кнопкаНаДесктопе),
      шторка: шторка.classList.contains(вёрстка.шторкаНаДесктопе),
    }).toEqual({ кнопка: true, шторка: true });
  });
});
