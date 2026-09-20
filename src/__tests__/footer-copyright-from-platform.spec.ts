import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Имя в подвале приходит из платформы, а не вмораживается прошлой сборкой.
 *
 * Владелец 20.09: «по подвалу просто копирайт должен браться из платформы, из
 * админки, если он там есть».
 *
 * ЧТО БЫЛО. Подстановка шла только когда поле пустое
 * (`!String(comp.props.siteTitle ?? "").trim()`), поэтому печаталось
 * ВМОРОЖЕННОЕ значение прошлой сборки. Замер 20.09:
 *
 *   rose   превью «MrMerfy»     витрина «Vanilla Pilot»  ← имя от другой темы
 *   bloom  превью «Bloom Pilot» витрина «Мой магазин»    ← запасное
 *
 * То есть переименование магазина в админке до витрины не доезжало вовсе, а
 * превью и витрина расходились.
 *
 * ПОЧЕМУ ПЕРЕЗАПИСЫВАТЬ МОЖНО. И `siteTitle`, и `copyright.companyName` в
 * панели подвала объявлены `type: 'hidden'` — мерчант их не редактирует, туда
 * пишет платформа. Единственное, что он реально задаёт, — название магазина в
 * админке. Поэтому companyName тоже чистим: `Footer.astro` читает его ПЕРВЫМ,
 * и мусор из сидов темы снова перебил бы имя из админки.
 *
 * ГДЕ ЖИВЁТ. В `applyFooterData` (utils/footer-data.ts) — единственном месте,
 * которое зовут ОБА пути рендера. В `build.service.ts` подстановка работала
 * только на сборке витрины, и конструктор её не видел.
 */

const SITES_ROOT = resolve(__dirname, "..", "..");
const FOOTER_DATA = readFileSync(resolve(SITES_ROOT, "src/utils/footer-data.ts"), "utf-8");
const PANEL = readFileSync(
  resolve(SITES_ROOT, "packages/theme-base/blocks/Footer/Footer.puckConfig.ts"),
  "utf-8",
);
const FOOTER = readFileSync(
  resolve(SITES_ROOT, "packages/theme-base/blocks/Footer/Footer.astro"),
  "utf-8",
);

describe("копирайт подвала берёт имя из платформы", () => {
  it("нет проверки «поле пустое» перед подстановкой", () => {
    // Кавычки в шаблоне не фиксируем: саботаж с одинарными кавычками проходил
    // мимо точного совпадения, и гард молчал. Ловим саму СУТЬ — любую проверку
    // непустоты siteTitle перед присваиванием.
    expect(FOOTER_DATA).not.toMatch(/!String\(\s*props\.siteTitle/);
    expect(FOOTER_DATA).not.toMatch(/props\.siteTitle\s*\?\?\s*['"]{2}\s*\)\s*\.trim\(\)/);
  });

  it("имя магазина кладётся в siteTitle", () => {
    expect(FOOTER_DATA).toMatch(/if \(siteName\) props\.siteTitle = siteName;/);
    expect(FOOTER_DATA).toMatch(/name: deps\.schema\.site\.name/);
  });

  it("companyName чистится — иначе он читается первым и перебивает", () => {
    expect(FOOTER_DATA).toMatch(/cr\.companyName = "";/);
    // порядок в самом подвале: companyName идёт раньше siteTitle
    const order = FOOTER.slice(
      FOOTER.indexOf("copyright?.companyName"),
      FOOTER.indexOf("copyright?.companyName") + 200,
    );
    expect(order).toMatch(/siteTitle/);
  });

  it("подстановка идёт только в блок подвала", () => {
    expect(FOOTER_DATA).toMatch(/component\?\.type !== "Footer"/);
  });

  /**
   * ВТОРОЙ ЗАХОД 20.09. Сначала правился массив `pages`, и замер показал, что
   * это лечит лишь часть: rose/satin/vanilla починились, bloom и flux остались
   * на запасном «Мой магазин» при верном имени в превью. Причина — подвал
   * собирается ДВУМЯ путями, и второй (`applyChromeToDist` → `assembleChrome`)
   * читает `revisionData`, а не копию в pages. Поэтому правим ИСТОЧНИК.
   */
  it("правится источник — revisionData, а не копия в pages", () => {
    expect(FOOTER_DATA).not.toMatch(/for \(const page of pages\)/);
  });

  it("обходит все страницы ревизии, а не только home", () => {
    expect(FOOTER_DATA).toMatch(/Object\.keys\(rev\.pagesData\)/);
    // и легаси-массив content тоже
    expect(FOOTER_DATA).toMatch(/Array\.isArray\(rev\.content\)/);
  });

  it("оба поля скрыты от мерчанта — перезапись законна", () => {
    expect(PANEL).toMatch(/siteTitle: \{ type: 'hidden'/);
    expect(PANEL).toMatch(/copyright: \{ type: 'hidden'/);
  });
});

describe("саботаж: гард ловит возврат прежнего поведения", () => {
  it("условие «только если пусто» — красный", () => {
    const old =
      'if (comp?.type === "Footer" && comp.props && !String(comp.props.siteTitle ?? "").trim()) {';
    expect(/!String\(comp\.props\.siteTitle \?\? ""\)\.trim\(\)/.test(old)).toBe(true);
  });

  it("без чистки companyName — красный", () => {
    const naive = "props.siteTitle = siteName;";
    expect(/cr\.companyName = ""/.test(naive)).toBe(false);
  });
});
