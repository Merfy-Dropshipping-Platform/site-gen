import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Владелец 20.09: «по подвалу просто копирайт должен браться из платформы, из
 * админки, если он там есть».
 *
 * ЧТО БЫЛО. Сборка клала название магазина в подвал только когда поле пустое
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
 * пишет сборка. Единственный источник, который мерчант реально задаёт, — имя
 * магазина в админке. Поэтому companyName тоже чистим: `Footer.astro` читает
 * его ПЕРВЫМ, и мусор из сидов темы снова перебил бы имя из админки.
 */

const SITES_ROOT = resolve(__dirname, "..", "..");
const BUILD = readFileSync(resolve(SITES_ROOT, "src/generator/build.service.ts"), "utf-8");
const PANEL = readFileSync(
  resolve(SITES_ROOT, "packages/theme-base/blocks/Footer/Footer.puckConfig.ts"),
  "utf-8",
);
const FOOTER = readFileSync(
  resolve(SITES_ROOT, "packages/theme-base/blocks/Footer/Footer.astro"),
  "utf-8",
);

/** Кусок сборки, отвечающий за имя в подвале. */
const block = BUILD.slice(
  BUILD.indexOf("Название магазина из админки"),
  BUILD.indexOf("Название магазина из админки") + 1800,
);

describe("копирайт подвала берёт имя из платформы", () => {
  it("сборка не проверяет «поле пустое» перед подстановкой", () => {
    // Кавычки в шаблоне не фиксируем: саботаж с одинарными кавычками проходил
    // мимо точного совпадения, и гард молчал. Ловим саму СУТЬ — любую проверку
    // непустоты siteTitle перед присваиванием.
    expect(block).not.toMatch(/!String\(\s*comp\.props\.siteTitle/);
    expect(block).not.toMatch(/comp\.props\.siteTitle\s*\?\?\s*['"]{2}\s*\)\s*\.trim\(\)/);
  });

  it("имя из админки кладётся в siteTitle безусловно", () => {
    expect(block).toMatch(/comp\.props\.siteTitle = ctx\.siteName;/);
  });

  it("companyName чистится — иначе он читается первым и перебивает", () => {
    expect(block).toMatch(/cr\.companyName = "";/);
    // порядок в самом подвале: companyName идёт раньше siteTitle
    const order = FOOTER.slice(FOOTER.indexOf("copyright?.companyName"), FOOTER.indexOf("copyright?.companyName") + 200);
    expect(order).toMatch(/siteTitle/);
  });

  it("подстановка идёт только в блок подвала", () => {
    expect(block).toMatch(/comp\?\.type !== "Footer"/);
  });

  /**
   * ВТОРОЙ ЗАХОД 20.09. Сначала правился массив `pages`, и замер показал, что
   * это лечит лишь часть: rose/satin/vanilla починились, bloom и flux остались
   * на запасном «Мой магазин» при верном имени в превью. Причина — подвал
   * собирается ДВУМЯ путями, и второй (`applyChromeToDist` → `assembleChrome`)
   * читает `ctx.revisionData`, а не копию в pages. Поэтому правим ИСТОЧНИК.
   */
  it("правится источник — revisionData, а не копия в pages", () => {
    expect(block).toMatch(/ctx\.revisionData as \{ pagesData\?/);
    expect(block).not.toMatch(/for \(const page of pages\)/);
  });

  it("правка стоит сразу после загрузки ревизии, до её копий", () => {
    const load = BUILD.indexOf("ctx.revisionData = resolveAssetUrls");
    const patch = BUILD.indexOf("Название магазина из админки");
    const pagesBuilt = BUILD.indexOf("const pages: PageEntry[] = []");
    expect(load).toBeGreaterThan(-1);
    expect(patch).toBeGreaterThan(load);
    expect(patch).toBeLessThan(pagesBuilt);
  });

  it("обходит все страницы ревизии, а не только home", () => {
    expect(block).toMatch(/Object\.keys\(pagesData \?\? \{\}\)/);
  });

  it("без имени магазина ничего не трогаем", () => {
    expect(block).toMatch(/if \(ctx\.siteName\) \{/);
  });

  it("оба поля скрыты от мерчанта — перезапись законна", () => {
    expect(PANEL).toMatch(/siteTitle: \{ type: 'hidden'/);
    expect(PANEL).toMatch(/copyright: \{ type: 'hidden'/);
  });
});

describe("саботаж: гард ловит возврат прежнего поведения", () => {
  it("условие «только если пусто» — красный", () => {
    const old = 'if (comp?.type === "Footer" && comp.props && !String(comp.props.siteTitle ?? "").trim()) {';
    expect(/!String\(comp\.props\.siteTitle \?\? ""\)\.trim\(\)/.test(old)).toBe(true);
  });

  it("без чистки companyName — красный", () => {
    const naive = "comp.props.siteTitle = ctx.siteName;";
    expect(/cr\.companyName = ""/.test(naive)).toBe(false);
  });
});
