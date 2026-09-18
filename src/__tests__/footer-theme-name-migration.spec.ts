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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { migrateRevisionData } from "../utils/revision-migrations";

const footerPage = (companyName?: string, siteTitle?: string) => ({
  content: [
    { type: "Header", props: { id: "Header-1" } },
    {
      type: "Footer",
      props: {
        id: "Footer-1",
        ...(siteTitle === undefined ? {} : { siteTitle }),
        copyright: { ...(companyName === undefined ? {} : { companyName }), showYear: true },
      },
    },
  ],
});

const footerOf = (data: unknown, pageId = "home"): any => {
  const pages = (data as { pagesData?: Record<string, any> }).pagesData ?? {};
  return (pages[pageId]?.content ?? []).find((b: any) => b?.type === "Footer");
};

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
/**
 * ВТОРАЯ ПОПРАВКА (19.09). Первая версия чистила только
 * `copyright.companyName` — и на живом стенде НЕ сработала: замер ревизии
 * satin показал, что имя темы лежит в другом поле, `siteTitle: "SATIN"`, при
 * магазине «Satin Demo». Вычистишь одно поле — подвал напечатает имя темы из
 * второго.
 */
describe("подвал: имя темы в siteTitle", () => {
  it("siteTitle, равный теме, заменяется названием магазина", () => {
    const out = migrateRevisionData(
      { pagesData: { home: footerPage(undefined, "SATIN") } },
      "satin",
      "Satin Demo",
    );
    expect(footerOf(out)?.props?.siteTitle).toBe("Satin Demo");
  });

  it("без названия магазина имя темы просто убирается", () => {
    const out = migrateRevisionData(
      { pagesData: { home: footerPage(undefined, "Bloom") } },
      "bloom",
      null,
    );
    expect(footerOf(out)?.props?.siteTitle).toBeUndefined();
  });

  it("своё название в siteTitle не трогаем", () => {
    const out = migrateRevisionData(
      { pagesData: { home: footerPage(undefined, "Лавка у дома") } },
      "satin",
      "Satin Demo",
    );
    expect(footerOf(out)?.props?.siteTitle).toBe("Лавка у дома");
  });

  it("оба поля разом: и companyName, и siteTitle", () => {
    const out = migrateRevisionData(
      { pagesData: { home: footerPage("Satin", "SATIN") } },
      "satin",
      "Satin Demo",
    );
    expect(companyOf(out)).toBeUndefined();
    expect(footerOf(out)?.props?.siteTitle).toBe("Satin Demo");
  });
});

/**
 * ТРЕТЬЯ ПОПРАВКА (19.09). После починки порта (он перестал подставлять
 * SITE_TITLE) подвал bloom стал печатать запасное «Мой магазин» вместо
 * «Bloom Pilot»: в ревизии у него siteTitle не было ВООБЩЕ, значит миграции
 * нечего было заменять. Владелец просил название из админки — подставляем его
 * и в пустое поле.
 */
describe("подвал: пустой siteTitle получает название магазина", () => {
  it("поля нет — подставляется название из админки", () => {
    const out = migrateRevisionData(
      { pagesData: { home: footerPage() } },
      "bloom",
      "Bloom Pilot",
    );
    expect(footerOf(out)?.props?.siteTitle).toBe("Bloom Pilot");
  });

  it("поля нет и магазин безымянный — ничего не выдумываем", () => {
    const out = migrateRevisionData({ pagesData: { home: footerPage() } }, "bloom", null);
    expect(footerOf(out)?.props?.siteTitle).toBeUndefined();
  });

  it("своё название на месте — не перезаписываем", () => {
    const out = migrateRevisionData(
      { pagesData: { home: footerPage(undefined, "Лавка у дома") } },
      "bloom",
      "Bloom Pilot",
    );
    expect(footerOf(out)?.props?.siteTitle).toBe("Лавка у дома");
  });
});

/**
 * ЧЕТВЁРТАЯ ПОПРАВКА (19.09) — проводка, а не логика.
 *
 * Миграция уже умела подставлять название магазина, и `GET /sites/:id/revisions/:rev`
 * отдавал «Bloom Pilot». А превью рисовало «Мой магазин»: ревизию для него
 * читает ОТДЕЛЬНЫЙ путь — `preview.controller.ts`, и он вызывал миграцию без
 * имени. Логика была верной, до превью она просто не доезжала.
 *
 * Поэтому сторожим оба пути чтения. Третий вызов (`revision-write-filter`)
 * намеренно без имени: он строит эталон для фильтра записи, и подстановка
 * развела бы эталон с тем, что шлёт клиент.
 */
describe("проводка: имя магазина доезжает во все пути чтения ревизии", () => {
  const read = (file: string) =>
    readFileSync(resolve(__dirname, "..", file), "utf-8");

  it("sites.service передаёт site.name", () => {
    const src = read("sites.service.ts");
    const i = src.indexOf("const migratedData = migrateRevisionData(");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 220)).toMatch(/site\.name/);
  });

  it("preview.controller передаёт site.name", () => {
    const src = read("controllers/preview.controller.ts");
    const i = src.indexOf("const migrated = migrateRevisionData(");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 220)).toMatch(/site\.name/);
    // И само поле обязано быть в выборке, иначе там будет undefined.
    expect(src).toMatch(/name:\s*schema\.site\.name/);
  });
});
