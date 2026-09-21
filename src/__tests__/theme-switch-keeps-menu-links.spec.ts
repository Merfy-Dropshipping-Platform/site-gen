import { carryOverMenuLinks } from "../sites.service";

/**
 * Баг 27 документа владельца «баги шапки и меню»: «Настроенные пункты меню
 * пропадают после переключения темы — так же, как пропадают секции и страницы».
 *
 * Причина найдена в пересеве ревизии при смене themeId: `carryOverUserPages`
 * переносил СТРАНИЦЫ мерчанта, а меню не переносил никто — шапка новой темы
 * приходила со своим сидовым списком.
 *
 * Перенос сделан условным намеренно. У тем РАЗНЫЕ заводские меню — у flux
 * «Смартфоны/Наушники/Ноутбуки», у bloom «Каталог/О нас/Доставка/Контакты», —
 * поэтому безусловный перенос затащил бы в новую тему чужое заводское меню.
 * Переносим только то, что мерчант правил: сравниваем с сидом ПРЕЖНЕЙ темы.
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

const SEED_FLUX = [
  { label: "Главная", href: "/" },
  { label: "Смартфоны", href: "/catalog" },
];
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

describe("смена темы не стирает пункты меню мерчанта", () => {
  it("правленое меню переезжает в новую тему", () => {
    const out = carryOverMenuLinks(
      revision(MERCHANT),
      revision(SEED_BLOOM),
      revision(SEED_FLUX),
    );
    expect(navOf(out)).toEqual(MERCHANT);
  });

  it("меню раскладывается во ВСЕ шапки, не только на главную", () => {
    const out = carryOverMenuLinks(
      revision(MERCHANT),
      revision(SEED_BLOOM),
      revision(SEED_FLUX),
    );
    expect(navOf(out, "page-about")).toEqual(MERCHANT);
  });

  it("нетронутое заводское меню НЕ переезжает — у новой темы своё", () => {
    // Мерчант меню не правил: список совпадает с сидом прежней темы.
    const out = carryOverMenuLinks(
      revision(SEED_FLUX),
      revision(SEED_BLOOM),
      revision(SEED_FLUX),
    );
    expect(navOf(out)).toEqual(SEED_BLOOM);
  });

  it("без сида прежней темы правленое меню всё равно сохраняется", () => {
    // Сид прежней темы мог не собраться — тогда осторожнее сохранить меню
    // мерчанта, чем потерять его.
    const out = carryOverMenuLinks(
      revision(MERCHANT),
      revision(SEED_BLOOM),
      null,
    );
    expect(navOf(out)).toEqual(MERCHANT);
  });

  it("пустая прежняя ревизия ничего не ломает", () => {
    const next = revision(SEED_BLOOM);
    expect(carryOverMenuLinks(null, next, revision(SEED_FLUX))).toBe(next);
    expect(carryOverMenuLinks(revision([]), next, revision(SEED_FLUX))).toBe(
      next,
    );
  });

  it("прочие свойства шапки и соседние блоки не трогаются", () => {
    const prev = revision(MERCHANT);
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
    const out = carryOverMenuLinks(prev, next, revision(SEED_FLUX)) as any;
    const blocks = out.pagesData.home.content;
    expect(blocks[0].props.logoPosition).toBe("top-center");
    expect(blocks[0].props.navigationLinks).toEqual(MERCHANT);
    expect(blocks[1]).toEqual(next.pagesData.home.content[1]);
  });
});
