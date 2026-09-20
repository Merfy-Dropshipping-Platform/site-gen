import { applyFooterData } from "../footer-data";

/**
 * ПОВЕДЕНЧЕСКАЯ проверка подстановки в подвал: гоняем сам `applyFooterData` на
 * поддельной базе и смотрим, что вышло в пропах.
 *
 * ЗАЧЕМ ОТДЕЛЬНО ОТ ТЕКСТОВЫХ ГАРДОВ. Соседние гарды ищут строки в исходнике —
 * и на саботаже `if (false && signature)` остались ЗЕЛЁНЫМИ: текст присваивания
 * никуда не делся, а подстановка была мертва. Ровно тот случай, ради которого
 * заведено правило «зелёный гард ≠ пруф».
 *
 * Владелец 20.09: «не тянет изменения из содержимого темы».
 */

type Row = Record<string, unknown>;

/**
 * Поддельная база: `select(...)` возвращает цепочку `.from(...).where(...)`,
 * которая отдаёт заранее заданный набор строк. Таблицу узнаём по ссылке на
 * объект схемы — порядок вызовов в `applyFooterData` не фиксируем, иначе
 * гард сломается от любой перестановки запросов.
 */
function fakeDb(rowsByTable: Map<unknown, Row[]>, schema: Record<string, unknown>) {
  return {
    select(_cols?: unknown) {
      return {
        from(table: unknown) {
          const rows = rowsByTable.get(table) ?? [];
          const thenable = {
            where: () => Promise.resolve(rows),
            then: (r: (v: Row[]) => unknown) => Promise.resolve(rows).then(r),
          };
          return thenable;
        },
      };
    },
    _schema: schema,
  } as never;
}

const site = { id: "site", name: "name", settings: "settings" };
const sitePolicy = { siteId: "siteId", type: "type", content: "content", updatedAt: "u" };
const siteContacts = { siteId: "siteId", fields: "fields", updatedAt: "u" };
const schema = { site, sitePolicy, siteContacts } as never;

function run(settings: Row | null, shopName = "Мой магазин") {
  const revision = {
    pagesData: {
      home: {
        content: [
          { type: "Header", props: { id: "h" } },
          { type: "Footer", props: { id: "f", copyright: { companyName: "Из сида темы" } } },
        ],
      },
    },
  } as Record<string, unknown>;
  const rows = new Map<unknown, Row[]>([
    [site, [{ name: shopName, settings }]],
    [sitePolicy, []],
    [siteContacts, []],
  ]);
  return applyFooterData({ db: fakeDb(rows, schema), schema }, "site-1", revision).then(
    (fingerprint) => {
      const content = (revision.pagesData as Record<string, { content: Row[] }>).home.content;
      const footer = content.find((c) => c.type === "Footer") as {
        props: Record<string, Record<string, unknown> | unknown>;
      };
      return { props: footer.props as Record<string, never>, fingerprint };
    },
  );
}

describe("подпись платформы доезжает до пропов подвала", () => {
  it("мерчантский текст кладётся в copyright.poweredBy", async () => {
    const { props } = await run({ themeBrandName: "Сделано в ООО «Ромашка»" });
    expect((props.copyright as Record<string, unknown>).poweredBy).toBe(
      "Сделано в ООО «Ромашка»",
    );
  });

  it("стандартный текст в проп НЕ уходит — иначе тема снимет ссылку", async () => {
    for (const value of ["Разработано на Merfy", "Powered by merfy", "  РАЗРАБОТАНО НА MERFY  "]) {
      const { props } = await run({ themeBrandName: value });
      expect({ value, poweredBy: (props.copyright as Record<string, unknown>).poweredBy }).toEqual({
        value,
        poweredBy: undefined,
      });
    }
  });

  it("пустая настройка ничего не проставляет", async () => {
    const { props } = await run({ themeBrandName: "   " });
    expect((props.copyright as Record<string, unknown>).poweredBy).toBeUndefined();
  });

  it("проп копирайта заводится, если его не было", async () => {
    const revision = {
      pagesData: { home: { content: [{ type: "Footer", props: { id: "f" } }] } },
    } as Record<string, unknown>;
    const rows = new Map<unknown, Row[]>([
      [site, [{ name: "Магазин", settings: { themeBrandName: "Своя подпись" } }]],
      [sitePolicy, []],
      [siteContacts, []],
    ]);
    await applyFooterData({ db: fakeDb(rows, schema), schema }, "site-1", revision);
    const footer = (revision.pagesData as Record<string, { content: Row[] }>).home
      .content[0] as { props: Record<string, Record<string, unknown>> };
    expect(footer.props.copyright.poweredBy).toBe("Своя подпись");
  });
});

describe("название магазина доезжает до пропов подвала", () => {
  it("siteTitle перезаписывается безусловно", async () => {
    const { props } = await run(null, "Ромашка");
    expect(props.siteTitle).toBe("Ромашка");
  });

  it("вмороженное имя прошлой сборки перетирается", async () => {
    // РОВНО ТОТ БАГ. Подстановка шла только в пустое поле, поэтому в подвале
    // жило значение прошлой сборки: на rose — имя чужой темы, на bloom
    // «Мой магазин». Переименование магазина до витрины не доезжало вовсе.
    const revision = {
      pagesData: {
        home: {
          content: [
            { type: "Footer", props: { id: "f", siteTitle: "Vanilla Pilot" } },
          ],
        },
      },
    } as Record<string, unknown>;
    const rows = new Map<unknown, Row[]>([
      [site, [{ name: "Ромашка", settings: null }]],
      [sitePolicy, []],
      [siteContacts, []],
    ]);
    await applyFooterData({ db: fakeDb(rows, schema), schema }, "site-1", revision);
    const footer = (revision.pagesData as Record<string, { content: Row[] }>).home
      .content[0] as { props: Record<string, unknown> };
    expect(footer.props.siteTitle).toBe("Ромашка");
  });

  it("companyName из сида темы вычищается", async () => {
    const { props } = await run(null, "Ромашка");
    expect((props.copyright as Record<string, unknown>).companyName).toBe("");
  });

  it("шапку не трогаем", async () => {
    const revision = {
      pagesData: {
        home: { content: [{ type: "Header", props: { id: "h" } }] },
      },
    } as Record<string, unknown>;
    const rows = new Map<unknown, Row[]>([
      [site, [{ name: "Ромашка", settings: { themeBrandName: "Своя подпись" } }]],
      [sitePolicy, []],
      [siteContacts, []],
    ]);
    await applyFooterData({ db: fakeDb(rows, schema), schema }, "site-1", revision);
    const header = (revision.pagesData as Record<string, { content: Row[] }>).home
      .content[0] as { props: Record<string, unknown> };
    expect(header.props).toEqual({ id: "h" });
  });
});

describe("отпечаток данных подвала", () => {
  it("меняется при смене подписи — иначе превью отдаст старый кэш", async () => {
    const a = await run({ themeBrandName: "Первая подпись" });
    const b = await run({ themeBrandName: "Вторая подпись" });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("меняется при переименовании магазина", async () => {
    const a = await run(null, "Ромашка");
    const b = await run(null, "Василёк");
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
