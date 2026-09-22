import { SitesDomainService, carryOverMenuLinks } from "../sites.service";
import * as schema from "../db/schema";

/**
 * Пункты меню магазина переживают смену темы — всегда, как страницы мерчанта.
 *
 * Баг 27 документа «баги шапки и меню» и баг 7 документа «баги бокового меню»:
 * «настроенные пункты меню пропадают после переключения темы; ожидаемо —
 * сохраняются, тот же флоу, что для страниц».
 *
 * Прежняя версия этого сторожа закрепляла эвристику «переносим, только если
 * мерчант меню правил»: меню, совпавшее с заводским меню прежней темы, заменялось
 * заводским меню новой. У flux заводское меню своё, у остальных четырёх общее —
 * и при переходах через flux пункты менялись сами. Решение владельца 23.09:
 * меню — данные магазина и переезжает всегда. Тест «нетронутое заводское меню
 * НЕ переезжает» перевёрнут: теперь оно переезжает.
 */
const header = (links: unknown) => ({
  type: "Header",
  props: { id: "Header-1", navigationLinks: links },
});

const revision = (links: unknown, extra: Record<string, unknown> = {}) => ({
  pagesData: {
    home: { content: [header(links), { type: "Footer", props: {} }] },
    "page-about": { content: [header(links)] },
    ...extra,
  },
});

const SEED_BLOOM = [
  { label: "Каталог", href: "/catalog" },
  { label: "О нас", href: "/about" },
];
const MERCHANT = [
  { label: "Новинки", href: "/catalog" },
  { label: "Распродажа", href: "/sale" },
  { label: "Доставка", href: "/delivery" },
];

const navOf = (data: unknown, pageId = "home") =>
  ((data as any).pagesData[pageId].content as any[]).find(
    (b) => b.type === "Header",
  ).props.navigationLinks;

describe("смена темы не стирает пункты меню магазина", () => {
  it("правленое меню переезжает в новую тему", () => {
    const out = carryOverMenuLinks(revision(MERCHANT), revision(SEED_BLOOM));
    expect(navOf(out)).toEqual(MERCHANT);
  });

  it("меню раскладывается во ВСЕ шапки, не только на главную", () => {
    const out = carryOverMenuLinks(revision(MERCHANT), revision(SEED_BLOOM));
    expect(navOf(out, "page-about")).toEqual(MERCHANT);
  });

  it("меню берётся с главной, даже если первой в ревизии лежит другая страница", () => {
    // Порядок ключей pagesData — порядок вставки. Шапки остальных страниц —
    // производные от главной, и устаревшая копия не должна перебить её меню.
    const prev = {
      pagesData: {
        "page-catalog": { content: [header(SEED_BLOOM)] },
        home: { content: [header(MERCHANT)] },
      },
    };
    const out = carryOverMenuLinks(prev, revision(SEED_BLOOM));
    expect(navOf(out)).toEqual(MERCHANT);
  });

  it("пустая прежняя ревизия и пустое меню ничего не ломают", () => {
    const next = revision(SEED_BLOOM);
    expect(carryOverMenuLinks(null, next)).toBe(next);
    // Пустое меню порты тем рисуют своим демо-меню — переносить нечего.
    expect(carryOverMenuLinks(revision([]), next)).toBe(next);
  });

  it("прочие свойства шапки и соседние блоки не трогаются", () => {
    const next = {
      pagesData: {
        home: {
          content: [
            {
              type: "Header",
              props: {
                id: "H",
                navigationLinks: SEED_BLOOM,
                logoPosition: "top-center",
              },
            },
            { type: "Footer", props: { id: "F", text: "подвал" } },
          ],
        },
      },
    };
    const out = carryOverMenuLinks(revision(MERCHANT), next) as any;
    const blocks = out.pagesData.home.content;
    expect(blocks[0].props.logoPosition).toBe("top-center");
    expect(blocks[0].props.navigationLinks).toEqual(MERCHANT);
    expect(blocks[1]).toEqual(next.pagesData.home.content[1]);
  });
});

/**
 * Тот же сценарий через НАСТОЯЩИЙ путь смены темы: `update({ themeId })`, как
 * его зовёт админка, с настоящим сидом новой темы. Чистой функции выше мало:
 * она зелёная, даже если пересев её не вызывает (так уже было с переносом
 * страниц, см. theme-switch-keeps-user-pages.spec.ts).
 *
 * Меню магазина здесь — НАСТОЯЩЕЕ заводское меню flux из его сида, которое
 * мерчант не правил. Именно его прежняя эвристика заменяла заводским меню bloom,
 * и пункты «пропадали»; на ней этот тест красный. Меню берём из сида, а не
 * вписываем руками: список, хоть на пункт отличный от сида, прежняя эвристика
 * тоже переносила бы, и тест не отличил бы старое поведение от нового.
 */
describe("update({ themeId }): меню магазина переезжает в пересеянную ревизию", () => {
  /** Заводское меню темы — из её настоящего сида, как его строит пересев. */
  async function factoryMenu(theme: string): Promise<unknown[]> {
    const dep = {} as any;
    const bare = new SitesDomainService(
      dep,
      dep,
      dep,
      dep,
      dep,
      dep,
      dep,
      dep,
      dep,
    ) as any;
    const seed = await bare.buildInitialRevision(theme);
    return seed.pagesData.home.content.find((b: any) => b.type === "Header")
      .props.navigationLinks;
  }

  function withLimit(rows: any[]) {
    const p: any = Promise.resolve(rows);
    p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
    return p;
  }

  function makeService(prevData: unknown) {
    const inserted: Array<{ table: unknown; value: any }> = [];
    let siteSelects = 0;
    const db: any = {
      select: () => ({
        from: (tbl: any) => ({
          where: () => {
            if (tbl === schema.site) {
              siteSelects += 1;
              return withLimit(
                siteSelects === 1
                  ? [{ themeId: "flux", status: "draft" }]
                  : [{ id: "site-1", currentRevisionId: "rev-1" }],
              );
            }
            if (tbl === schema.siteRevision)
              return withLimit([{ data: prevData }]);
            return withLimit([]);
          },
        }),
      }),
      insert: (tbl: any) => ({
        values: async (value: any) => {
          inserted.push({ table: tbl, value });
          return value;
        },
      }),
      update: () => ({
        set: () => ({
          where: () => {
            const p: any = Promise.resolve([{ id: "site-1" }]);
            p.returning = () => Promise.resolve([{ id: "site-1" }]);
            return p;
          },
        }),
      }),
    };
    const dep = {} as any;
    const events = { emit: () => undefined };
    const service = new SitesDomainService(
      db,
      dep,
      dep,
      events as any,
      dep,
      dep,
      dep,
      dep,
      dep,
    );
    jest.spyOn(service, "get").mockResolvedValue({
      id: "site-1",
      tenantId: "t1",
      currentRevisionId: "rev-current",
    } as any);
    return { service, inserted };
  }

  it("нетронутое заводское меню flux остаётся меню магазина после перехода на bloom", async () => {
    const FLUX_FACTORY = await factoryMenu("flux");
    const BLOOM_FACTORY = await factoryMenu("bloom");
    // Заводские меню тем разные — иначе проверка ниже ничего не различает.
    expect(FLUX_FACTORY).not.toEqual(BLOOM_FACTORY);

    const prev = {
      pages: [{ id: "home", source: "theme" }],
      pagesData: {
        home: {
          content: [header(FLUX_FACTORY), { type: "Footer", props: {} }],
        },
      },
      themeSettings: { colorSchemes: [{ id: "x" }] },
    };
    const { service, inserted } = makeService(prev);

    await service.update({
      tenantId: "t1",
      siteId: "site-1",
      patch: { themeId: "bloom" },
      actorUserId: "u1",
    });

    const reseed = inserted.find((i) => i.table === schema.siteRevision);
    expect(reseed).toBeDefined();
    expect(reseed!.value.meta).toEqual({ title: "Theme reseed" });
    const data = reseed!.value.data;
    // Канон bloom действительно пришёл (иначе проверка ниже ничего не значит).
    expect(Object.keys(data.pagesData).length).toBeGreaterThan(5);
    // Меню магазина — во ВСЕХ шапках пересеянной ревизии, а не заводское bloom.
    const navs = Object.values(data.pagesData as Record<string, any>)
      .flatMap((page: any) =>
        Array.isArray(page?.content) ? page.content : [],
      )
      .filter((block: any) => block?.type === "Header")
      .map((block: any) => block.props.navigationLinks);
    expect(navs.length).toBeGreaterThan(5);
    for (const nav of navs) expect(nav).toEqual(FLUX_FACTORY);
  });
});
