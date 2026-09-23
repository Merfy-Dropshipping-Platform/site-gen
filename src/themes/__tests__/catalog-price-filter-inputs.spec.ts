/**
 * @jest-environment jsdom
 *
 * Фильтр «Стоимость» в «Группе товаров» — поля ввода в ОБЕИХ раскладках
 * («Сверху» и «Сбоку») всех пяти тем.
 *
 * Владелец, 23.09: «фильтрам и сортировке…». Замер превью: у vanilla при виде
 * фильтра «Сбоку» цена была простым текстом «0 / 5 990» — боковая панель не
 * несла метку `data-nt="catalog-price"`, по которой скрипт каталога меняет
 * значения на поля ввода. У остальных тем поля были. Стенд vanilla стоит на
 * «Сверху», поэтому живой замер поломку не видел.
 *
 * Проверка: собственный скрипт каталога исполняется, и после него в секции не
 * остаётся статичного «5 990» (неоживлённое поле цены). Для vanilla — ещё и
 * счёт: в разметке обе раскладки, значит полей ввода цены четыре.
 */
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const ТЕМЫ = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
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
  document.body.innerHTML = "";
}
afterAll(() => снять());

async function оживить(тема: string, раскладка: "side" | "top"): Promise<void> {
  снять();
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
        showFilter: "true",
        showSort: "true",
        filterPosition: раскладка,
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
}

/** Статичный «5 990» — поле цены, которое скрипт не превратил в ввод. */
const статичныхЦен = () =>
  Array.from(document.querySelectorAll("span, p, div")).filter(
    (e) => e.children.length === 0 && (e.textContent ?? "").trim() === "5 990",
  ).length;

describe("«Стоимость» — поля ввода в обеих раскладках фильтра", () => {
  for (const тема of ТЕМЫ) {
    for (const раскладка of ["side", "top"] as const) {
      it(`${тема}, «${раскладка === "side" ? "Сбоку" : "Сверху"}»: неоживлённой цены нет`, async () => {
        await оживить(тема, раскладка);
        expect({ тема, раскладка, статичных: статичныхЦен() }).toEqual({
          тема,
          раскладка,
          статичных: 0,
        });
      });
    }
  }

  it("vanilla: в разметке обе раскладки — полей цены четыре", async () => {
    await оживить("vanilla", "side");
    expect(document.querySelectorAll("[data-price-input]").length).toBe(4);
  });
});
