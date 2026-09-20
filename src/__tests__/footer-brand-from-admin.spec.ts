import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Владелец 20.09, уточнение по подвалу: копирайт «должен браться исключительно
 * из Содержимое темы в админке… данная информация идёт только из блока
 * информации, если заполнено, а не от темы».
 *
 * «Содержимое темы» — окно в меню карточки темы («Редактировать содержимое
 * темы», подпись поля: «Замените стандартный текст на название бренда»).
 * Раньше оно жило только в `useState` админки: значение терялось при
 * перезагрузке и до подвала не доходило вовсе.
 *
 * Теперь оно сохраняется в настройки магазина, а сборка берёт его ПЕРВЫМ.
 * Порядок: бренд из окна → название магазина → ничего. Имя ТЕМЫ в копирайт не
 * попадает ни при каком раскладе (её вычищает миграция подвала).
 */

const ROOT = resolve(__dirname, "..", "..");
const BUILD = readFileSync(resolve(ROOT, "src/generator/build.service.ts"), "utf-8");

const block = BUILD.slice(
  BUILD.indexOf("Название бренда из окна"),
  BUILD.indexOf("Название бренда из окна") + 2200,
);

describe("копирайт подвала: бренд из админки сильнее названия магазина", () => {
  it("бренд читается из настроек магазина", () => {
    expect(block).toMatch(/themeBrandName\?: unknown/);
  });

  it("пустая строка брендом не считается", () => {
    expect(block).toMatch(/typeof raw === "string" && raw\.trim\(\)/);
  });

  it("порядок: бренд → название магазина", () => {
    expect(block).toMatch(/const footerBrand = brandFromSettings \?\? ctx\.siteName \?\? null;/);
  });

  it("в подвал уходит именно выбранный бренд, а не название магазина", () => {
    expect(block).toMatch(/comp\.props\.siteTitle = footerBrand;/);
    expect(block).not.toMatch(/comp\.props\.siteTitle = ctx\.siteName;/);
  });

  it("без бренда и без названия ничего не проставляется", () => {
    expect(block).toMatch(/if \(footerBrand\) \{/);
  });
});

describe("саботаж: гард ловит возврат прежнего источника", () => {
  it("подстановка названия магазина напрямую — красный", () => {
    const naive = "comp.props.siteTitle = ctx.siteName;";
    expect(/comp\.props\.siteTitle = footerBrand;/.test(naive)).toBe(false);
  });

  it("пустой бренд не должен побеждать — красный", () => {
    const naive = "const brand = settings?.themeBrandName ?? null;";
    expect(/raw\.trim\(\)/.test(naive)).toBe(false);
  });
});
