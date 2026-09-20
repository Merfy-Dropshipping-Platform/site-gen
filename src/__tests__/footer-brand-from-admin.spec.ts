import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Окно «Редактировать содержимое темы» правит ПОДПИСЬ ПЛАТФОРМЫ в подвале.
 *
 * Владелец 20.09, скриншотом: «Идёт только из содержимого темы, изначально во
 * всех темах сделать Разработано на Merfy и всё предложение идёт ссылкой на
 * лендос, но при изменении ссылка убирается и идёт просто текст».
 *
 * ТРИ ЗАХОДА, и каждый предыдущий был виден только частично.
 *
 *  1. Значение клали в `siteTitle` — имя бренда внутри копирайта. Тем же днём
 *     копирайт из тем убрали целиком, и `siteTitle` перестал быть виден в
 *     подвале вовсе: поле правилось, на витрине не менялось ничего.
 *  2. Значение перевели в `copyright.poweredBy`, но подстановка жила в
 *     `build.service.ts` — то есть работала ТОЛЬКО на сборке витрины.
 *     Конструктор и превью идут своим путём и настройку не читали вообще:
 *     владелец сообщил «не тянет изменения из содержимого темы».
 *  3. Подстановка переехала в `applyFooterData` — единственное место, которое
 *     зовут ОБА пути (сборка после stageMerge и preview-контроллер).
 *
 * СТАНДАРТНЫЙ ТЕКСТ НЕ СЧИТАЕТСЯ ПРАВКОЙ. Окно показывает «Разработано на
 * Merfy»; нажатие «Сохранить» без изменений положит в настройки дефолт.
 * Пропусти его в проп — и тема сочтёт текст мерчантским и СНИМЕТ ссылку.
 */

const ROOT = resolve(__dirname, "..", "..");
const FOOTER_DATA = readFileSync(resolve(ROOT, "src/utils/footer-data.ts"), "utf-8");
const BUILD = readFileSync(resolve(ROOT, "src/generator/build.service.ts"), "utf-8");
const PREVIEW = readFileSync(resolve(ROOT, "src/controllers/preview.controller.ts"), "utf-8");

describe("подпись подвала берётся из окна «Содержимое темы»", () => {
  it("значение читается из настроек магазина", () => {
    expect(FOOTER_DATA).toMatch(/themeBrandName\?: unknown/);
    expect(FOOTER_DATA).toMatch(/settings: deps\.schema\.site\.settings/);
  });

  it("пустая строка значением не считается", () => {
    expect(FOOTER_DATA).toMatch(/typeof raw !== "string" \|\| !raw\.trim\(\)/);
  });

  it("стандартный текст подписи отбрасывается", () => {
    expect(FOOTER_DATA).toMatch(/PLATFORM_SIGNATURE_DEFAULTS/);
    expect(FOOTER_DATA).toMatch(/"powered by merfy"/);
    expect(FOOTER_DATA).toMatch(/"разработано на merfy"/);
    // Регистронезависимо: в админке дефолт печатался и с маленькой «m».
    expect(FOOTER_DATA).toMatch(/\.has\(value\.toLowerCase\(\)\) \? null : value/);
  });

  it("значение уходит в подпись, а не в имя бренда", () => {
    expect(FOOTER_DATA).toMatch(/cr\.poweredBy = signature;/);
    expect(FOOTER_DATA).not.toMatch(/props\.siteTitle = signature/);
  });

  it("если пропа копирайта ещё нет — он заводится", () => {
    expect(FOOTER_DATA).toMatch(/props\.copyright = \{ poweredBy: signature \}/);
  });

  it("siteTitle остаётся названием магазина", () => {
    expect(FOOTER_DATA).toMatch(/if \(siteName\) props\.siteTitle = siteName;/);
  });
});

describe("подстановку применяют ОБА пути рендера", () => {
  it("живёт в общем модуле, а не в сборке витрины", () => {
    expect(FOOTER_DATA).toMatch(/themeBrandName/);
    // В build.service её больше нет — иначе снова разъедется с превью.
    expect(BUILD).not.toMatch(/themeBrandName/);
  });

  it("сборка зовёт общий модуль", () => {
    expect(BUILD).toMatch(/import \{ applyFooterData \} from "\.\.\/utils\/footer-data"/);
    expect(BUILD).toMatch(/await applyFooterData\(/);
  });

  it("превью зовёт тот же общий модуль", () => {
    expect(PREVIEW).toMatch(/import \{ applyFooterData \} from '\.\.\/utils\/footer-data'/);
    expect(PREVIEW).toMatch(/await applyFooterData\(/);
  });

  it("отпечаток данных подвала меняется вместе с подписью", () => {
    // Иначе превью отдаёт закэшированный HTML со старым текстом сразу после
    // правки в админке — «не тянет» вернулось бы кэшом.
    expect(FOOTER_DATA).toMatch(/\$\{siteName \?\? "-"\}\.\$\{sig\}/);
    expect(FOOTER_DATA).toMatch(/const sig = signature \? signature\.length \+ ":" \+ signature : "-"/);
  });
});

describe("саботаж: гард ловит возврат прежнего источника", () => {
  it("подстановка обратно в build.service — красный", () => {
    const old = "const footerBrand = brandFromSettings ?? ctx.siteName ?? null;";
    expect(/if \(siteName\) props\.siteTitle = siteName;/.test(old)).toBe(false);
  });

  it("дефолт пропускается как мерчантский текст — красный", () => {
    const naive = "const signature = raw.trim() ? raw.trim() : null;";
    expect(/PLATFORM_SIGNATURE_DEFAULTS/.test(naive)).toBe(false);
  });
});
