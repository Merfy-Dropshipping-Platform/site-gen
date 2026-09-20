/**
 * Подвал показывает логотип магазина и его название — не имя темы.
 *
 * Владелец, 18.09, дословно: «Satin, Bloom, Vanilla — в подвал должна идти лого
 * из настроек темы, если загружена, или, если нет, то как в шапке браться с
 * админки, а не отображаться название темы».
 *
 * ЗАМЕР ДО (чтением кода и сидов):
 *   • `packages/theme-<bloom|flux|satin>/pages/home.json` клали блоку Footer
 *     `copyright.companyName` = имя ТЕМЫ («Bloom», «Flux», «Satin»), а оно в
 *     `Footer.astro` первым в цепочке `companyName → siteTitle → «Мой магазин»`.
 *     Отсюда «SATIN» в подвале при магазине «МОЙ САЙТ» на скриншоте владельца.
 *   • Логотипа у подвала не было вовсе: проп `logo` в блок не приходил, а
 *     `build.service.ts` подставлял `branding.logoUrl` ТОЛЬКО в `Header`.
 *
 * Тест сторожит оба конца: сиды тем без имени темы и проводку сборки.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

/** Блоки Footer из сида главной страницы темы. */
function footerBlocks(theme: string): Array<Record<string, any>> {
  const raw = readFileSync(resolve(ROOT, `packages/theme-${theme}/pages/home.json`), "utf-8");
  const found: Array<Record<string, any>> = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const o = node as Record<string, any>;
      if (o.type === "Footer") found.push(o.props ?? {});
      Object.values(o).forEach(walk);
    }
  };
  walk(JSON.parse(raw));
  return found;
}

describe("подвал: источник названия и логотипа", () => {
  it("САБОТАЖ-ОПОРА: сид главной у каждой темы реально содержит блок Footer", () => {
    // Иначе проверка ниже была бы правдой всегда и не сторожила бы ничего.
    for (const theme of THEMES) {
      expect(footerBlocks(theme).length).toBeGreaterThan(0);
    }
  });

  it.each(THEMES)("%s: сид не подсовывает подвалу имя темы", (theme) => {
    for (const props of footerBlocks(theme)) {
      const company = String(props?.copyright?.companyName ?? "").trim();
      const title = String(props?.siteTitle ?? "").trim();
      for (const value of [company, title]) {
        if (!value) continue;
        // Имя темы в подвале — ровно тот баг: магазин называется иначе.
        expect(value.toLowerCase()).not.toBe(theme.toLowerCase());
      }
    }
  });

  it("Footer.astro рисует логотип, когда он пришёл, и название — когда нет", () => {
    const astro = readFileSync(
      resolve(ROOT, "packages/theme-base/blocks/Footer/Footer.astro"),
      "utf-8",
    );
    // Проп берётся из Astro.props — иначе рисовать нечего.
    expect(astro).toMatch(/const\s*\{[\s\S]*?\blogo\b[\s\S]*?\}\s*=\s*Astro\.props/);
    // Есть ветка «логотип или текст», а не безусловный текст.
    expect(astro).toMatch(/logoSrc\s*$/m);
    expect(astro).toMatch(/logoSrc[\s\S]{0,200}<img src=\{logoSrc\}/);
    expect(astro).toMatch(/:\s*brandName/);
  });

  it("схема подвала знает про логотип, но в панель секции его не выводит", () => {
    const cfg = readFileSync(
      resolve(ROOT, "packages/theme-base/blocks/Footer/Footer.puckConfig.ts"),
      "utf-8",
    );
    expect(cfg).toMatch(/logo:\s*z\.string\(\)\.optional\(\)/);
    // Состав параметров сайдбара — канон проекта: служебное поле туда не лезет.
    const fieldsStart = cfg.indexOf("fields:");
    if (fieldsStart >= 0) {
      const fields = cfg.slice(fieldsStart);
      expect(fields).not.toMatch(/\blogo\b\s*:/);
    }
  });

  it("сборка кладёт логотип брендинга и в шапку, и в подвал", () => {
    const build = readFileSync(resolve(ROOT, "src/generator/build.service.ts"), "utf-8");
    const start = build.indexOf("branding?.logoUrl && pages.length > 0");
    expect(start).toBeGreaterThan(-1);
    // Окно режем по концу самого цикла, иначе в него попадает СОСЕДНИЙ блок
    // (подстановка названия магазина), где слово "Footer" тоже есть — и
    // саботаж «убрать Footer из подстановки логотипа» проходил бы зелёным.
    const block = build.slice(start, start + 520);
    expect(block).toMatch(/comp\?\.type === "Header" \|\| comp\?\.type === "Footer"/);
    expect(block).toMatch(/comp\.props\.logo\s*=\s*ctx\.branding\.logoUrl/);
  });

  it("сборка подставляет подвалу название бренда из платформы", () => {
    // ПОПРАВКА 20.09. Раньше здесь требовалось обратное: писать имя ТОЛЬКО
    // когда поле пустое — «чтобы не затереть правку мерчанта». Правки мерчанта
    // там не бывает: и `siteTitle`, и `copyright.companyName` объявлены в
    // панели подвала `type: 'hidden'`, туда пишет сборка. Из-за проверки на
    // пустоту в подвал ехало ВМОРОЖЕННОЕ значение прошлой сборки — на rose
    // стояло имя чужой темы, на bloom «Мой магазин», переименование магазина
    // до витрины не доходило вовсе. Условие снято; источник имени теперь
    // шире — сперва бренд из окна «Содержимое темы», затем название магазина.
    const build = readFileSync(resolve(ROOT, "src/generator/build.service.ts"), "utf-8");
    const start = build.indexOf("const footerBrand = brandFromSettings");
    expect(start).toBeGreaterThan(-1);
    const block = build.slice(start, start + 900);
    expect(block).toContain('"Footer"');
    expect(block).toMatch(/const footerBrand = brandFromSettings \?\? ctx\.siteName/);
    expect(block).toMatch(/comp\.props\.siteTitle = footerBrand;/);
    // И никакой проверки «поле пустое» перед записью — ровно её и снимали.
    expect(block).not.toMatch(/!String\(\s*comp\.props\.siteTitle/);
  });
});
