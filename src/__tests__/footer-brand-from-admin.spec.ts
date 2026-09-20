import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Окно «Редактировать содержимое темы» правит ПОДПИСЬ ПЛАТФОРМЫ в подвале.
 *
 * Владелец 20.09, скриншотом: «Идёт только из содержимого темы, изначально во
 * всех темах сделать Разработано на Merfy и всё предложение идёт ссылкой на
 * лендос, но при изменении ссылка убирается и идёт просто текст».
 *
 * ДВА ЗАХОДА. Сначала значение окна клали в `siteTitle` — имя бренда внутри
 * копирайта. Тем же днём владелец потребовал убрать копирайт из тем целиком
 * («данная информация идёт только из блока информации»), и `siteTitle`
 * перестал быть виден в подвале вовсе: поле в админке правилось, а на витрине
 * не менялось ничего. Поэтому значение идёт туда, где оно видно, —
 * в `copyright.poweredBy`, а `siteTitle` вернулся к названию магазина.
 *
 * СТАНДАРТНЫЙ ТЕКСТ НЕ СЧИТАЕТСЯ ПРАВКОЙ. Окно показывает «Разработано на
 * Merfy»; если мерчант просто нажмёт «Сохранить», в настройках окажется
 * дефолт. Пропусти его в проп — и тема сочтёт текст мерчантским и СНИМЕТ с
 * него ссылку, хотя мерчант ничего не менял.
 */

const ROOT = resolve(__dirname, "..", "..");
const BUILD = readFileSync(resolve(ROOT, "src/generator/build.service.ts"), "utf-8");

const ANCHOR = "Окно «Редактировать содержимое темы»";
const block = BUILD.slice(BUILD.indexOf(ANCHOR), BUILD.indexOf(ANCHOR) + 2600);

describe("подпись подвала берётся из окна «Содержимое темы»", () => {
  it("значение читается из настроек магазина", () => {
    expect(block).toMatch(/themeBrandName\?: unknown/);
  });

  it("пустая строка значением не считается", () => {
    expect(block).toMatch(/typeof raw !== "string" \|\| !raw\.trim\(\)/);
  });

  it("стандартный текст подписи отбрасывается", () => {
    expect(block).toMatch(/PLATFORM_SIGNATURE_DEFAULTS/);
    expect(block).toMatch(/"powered by merfy"/);
    expect(block).toMatch(/"разработано на merfy"/);
    // Сравнение регистронезависимое: в админке дефолт печатался и с маленькой
    // «m» («Powered by merfy»), и с большой.
    expect(block).toMatch(/\.has\(value\.toLowerCase\(\)\) \? null : value/);
  });

  it("значение уходит в подпись, а не в имя бренда", () => {
    expect(block).toMatch(/cr\.poweredBy = signatureFromSettings;/);
    expect(block).not.toMatch(/comp\.props\.siteTitle = signatureFromSettings/);
  });

  it("если пропа копирайта ещё нет — он заводится", () => {
    // Иначе у ревизий без блока `copyright` подпись просто некуда положить.
    expect(block).toMatch(/comp\.props\.copyright = \{ poweredBy: signatureFromSettings \}/);
  });

  it("siteTitle остаётся названием магазина", () => {
    expect(block).toMatch(/const footerBrand = ctx\.siteName \?\? null;/);
    expect(block).toMatch(/if \(footerBrand\) comp\.props\.siteTitle = footerBrand;/);
  });

  it("без названия и без подписи ничего не проставляется", () => {
    expect(block).toMatch(/if \(footerBrand \|\| signatureFromSettings\) \{/);
  });

  it("правится только блок подвала", () => {
    expect(block).toMatch(/comp\?\.type !== "Footer"/);
  });
});

describe("саботаж: гард ловит возврат прежнего источника", () => {
  it("значение окна снова в siteTitle — красный", () => {
    const old = "const footerBrand = brandFromSettings ?? ctx.siteName ?? null;";
    expect(/const footerBrand = ctx\.siteName \?\? null;/.test(old)).toBe(false);
  });

  it("дефолт пропускается как мерчантский текст — красный", () => {
    const naive = 'const signature = raw.trim() ? raw.trim() : null;';
    expect(/PLATFORM_SIGNATURE_DEFAULTS/.test(naive)).toBe(false);
  });
});
