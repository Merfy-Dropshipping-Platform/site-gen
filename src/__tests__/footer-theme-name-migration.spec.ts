/**
 * Подвал уже созданных сайтов перестаёт печатать имя темы.
 *
 * Владелец 18.09: «в подвал должна идти лого из настроек темы, если загружена,
 * или, если нет, то как в шапке браться с админки, а не отображаться название
 * темы».
 *
 * ПОЧЕМУ ЭТОГО МАЛО БЫЛО. Первым заходом я вычистил имя темы из СИДОВ
 * (`packages/theme-<bloom|flux|satin>/pages/home.json`) и прокинул в подвал
 * логотип с названием магазина. Замер живых витрин 19.09 показал, что этого
 * недостаточно: satin печатает «SATIN», bloom — «Bloom», при том что сборка
 * свежая (last-modified 18.09 22:00 UTC, мой коммит — 18.09 04:45). Причина:
 * у сайтов, созданных ДО чистки, значение лежит в их собственной ревизии, и
 * правка сидов до них не доходит — она про новые сайты.
 *
 * Поэтому чистка перенесена в миграцию ревизии: она работает на чтении, то
 * есть и в превью конструктора, и в сборке витрины.
 */
import { migrateRevisionData } from "../utils/revision-migrations";

const footerPage = (companyName?: string) => ({
  content: [
    { type: "Header", props: { id: "Header-1" } },
    {
      type: "Footer",
      props: {
        id: "Footer-1",
        copyright: { ...(companyName === undefined ? {} : { companyName }), showYear: true },
      },
    },
  ],
});

const companyOf = (data: unknown, pageId = "home"): unknown => {
  const pages = (data as { pagesData?: Record<string, any> }).pagesData ?? {};
  const footer = (pages[pageId]?.content ?? []).find((b: any) => b?.type === "Footer");
  return footer?.props?.copyright?.companyName;
};

describe("подвал: имя темы вычищается из ревизии", () => {
  it.each([
    ["bloom", "Bloom"],
    ["flux", "Flux"],
    ["satin", "Satin"],
  ])("%s: «%s» из сида убирается", (theme, seeded) => {
    const out = migrateRevisionData({ pagesData: { home: footerPage(seeded) } }, theme);
    expect(companyOf(out)).toBeUndefined();
  });

  it("регистр не спасает — «SATIN» тоже уходит", () => {
    const out = migrateRevisionData({ pagesData: { home: footerPage("SATIN") } }, "satin");
    expect(companyOf(out)).toBeUndefined();
  });

  it("название магазина мерчанта НЕ трогаем", () => {
    const out = migrateRevisionData({ pagesData: { home: footerPage("Мой магазин") } }, "satin");
    expect(companyOf(out)).toBe("Мой магазин");
  });

  it("имя чужой темы не трогаем — чистим только активную", () => {
    // Сайт на satin с названием «Bloom» — это выбор мерчанта, а не остаток сида.
    const out = migrateRevisionData({ pagesData: { home: footerPage("Bloom") } }, "satin");
    expect(companyOf(out)).toBe("Bloom");
  });

  it("без темы миграция ничего не делает", () => {
    const out = migrateRevisionData({ pagesData: { home: footerPage("Satin") } }, null);
    expect(companyOf(out)).toBe("Satin");
  });

  it("САБОТАЖ-ОПОРА: соседние поля подвала переживают миграцию", () => {
    // Если бы миграция сносила блок целиком, проверки выше были бы «зелёными»
    // по недоразумению.
    const out = migrateRevisionData({ pagesData: { home: footerPage("Satin") } }, "satin");
    const pages = (out as { pagesData?: Record<string, any> }).pagesData ?? {};
    const footer = (pages.home?.content ?? []).find((b: any) => b?.type === "Footer");
    expect(footer?.props?.id).toBe("Footer-1");
    expect(footer?.props?.copyright?.showYear).toBe(true);
    expect((pages.home?.content ?? []).some((b: any) => b?.type === "Header")).toBe(true);
  });
});
