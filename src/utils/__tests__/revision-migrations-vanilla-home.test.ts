import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 084 vanilla pilot — было Stage 2 Task 13 (v10), потом дошло до v11.
 *
 * Раньше главная vanilla пересобиралась ПРИ КАЖДОМ ЧТЕНИИ функцией
 * `migrateVanillaHomePage(pagesData, themeId)`: version-миграция штамповала
 * `Date.now()` в id девяти из десяти блоков, поэтому два подряд GET одной и
 * той же несохранённой ревизии отдавали РАЗНЫЕ id (находка волны 0,
 * `merfy-mcp/docs/proofs/p2-wave0-golden.txt`).
 *
 * Бриф `merfy-mcp/docs/plans/2026-09-23-vanilla-seed-into-package.md`: тема —
 * это данные её пакета, не код. Миграция удалена, десять блоков главной
 * переехали в `packages/theme-vanilla/pages/home.json` с ДЕТЕРМИНИРОВАННЫМИ
 * id по конвенции пакета (`<Тип>-home`). Этот файл пинит форму пакетного
 * сида: состав/порядок блоков, стабильность id и variant-пропы, которые
 * раньше проверялись на выходе миграции.
 */
describe("packages/theme-vanilla/pages/home.json — пакетный сид главной", () => {
  type Block = { type: string; props: Record<string, unknown> };
  type Home = { content: Block[]; root?: unknown; zones?: unknown };

  const HOME_PATH = resolve(
    __dirname,
    "../../../packages/theme-vanilla/pages/home.json",
  );

  function loadHome(): Home {
    return JSON.parse(readFileSync(HOME_PATH, "utf-8")) as Home;
  }

  const expectedSequence = [
    "PromoBanner",
    "Header",
    "Hero",
    "Collections",
    "MainText",
    "Video",
    "ImageWithText",
    "PopularProducts",
    "Newsletter",
    "Footer",
  ];

  it("содержит ровно 10 блоков в каноническом порядке", () => {
    const home = loadHome();
    expect(home.content.map((b) => b.type)).toEqual(expectedSequence);
  });

  it("id блоков детерминированы по конвенции пакета (<Тип>-home)", () => {
    const home = loadHome();
    const ids = home.content.map((b) => b.props.id);
    expect(ids).toEqual([
      "PromoBanner-home",
      "Header-home",
      "Hero-home",
      "Collections-home",
      "MainText-home",
      "Video-home",
      "ImageWithText-home",
      "PopularProducts-home",
      "Newsletter-home",
      "Footer-home",
    ]);
  });

  it("чтение файла дважды даёт байт-в-байт одинаковый результат (нет Date.now())", () => {
    const once = readFileSync(HOME_PATH, "utf-8");
    const twice = readFileSync(HOME_PATH, "utf-8");
    expect(once).toBe(twice);
    expect(once).not.toMatch(/\d{10,}/); // ни одного таймстампа в id/значениях
  });

  it("bakes in vanilla-specific props on each block (variants visible in constructor)", () => {
    const blocks = loadHome().content;

    // PromoBanner
    const promoBanner = blocks[0].props;
    // Сид называет размер честно: 'large' = полоса вёрстки vanilla (48px).
    // Раньше стояло 'thin', а порт молча подменял его на large (0a37abb4).
    expect(promoBanner.size).toBe("large");
    expect(promoBanner.textTransform).toBe("uppercase");
    expect(promoBanner.colorScheme).toBe("scheme-1");

    // Header — 32/32 padding для 80px высоты по Figma
    const header = blocks[1].props;
    expect(header.logoPosition).toBe("center-absolute");
    expect(header.activeLinkIndicator).toBe("underline");
    expect(header.padding).toEqual({ top: 32, bottom: 32 });

    // Hero — carousel-режим (было Stage 1)
    const hero = blocks[2].props;
    expect(hero.mode).toBe("carousel");
    expect(hero.contentAlign).toBe("left");
    expect(hero.alignment).toBe("left");
    expect(hero.pagination).toBe("numbers");
    expect(Array.isArray(hero.slides)).toBe(true);
    expect((hero.slides as unknown[]).length).toBe(3);
    expect((hero.slides as Array<{ id: string }>).map((s) => s.id)).toEqual([
      "slide-home-1",
      "slide-home-2",
      "slide-home-3",
    ]);

    // Collections
    const collections = blocks[3].props;
    expect(collections.gridAspect).toBe("1:1");
    expect(collections.cardCaptionStyle).toBe("uppercase");
    expect(collections.dataSource).toBe("manual");
    expect(collections.titleAlignment).toBe("left");
    expect(collections.padding).toEqual({ top: 120, bottom: 120 });
    const collArr = collections.collections as Array<{ collectionId: string }>;
    expect(collArr.map((c) => c.collectionId)).toEqual(["mebel", "dekor"]);

    // MainText
    const mainText = blocks[4].props;
    expect(mainText.buttonStyle).toBe("outlined");
    // Схема 5 — олива с белым контуром кнопки (вёрстка «К покупкам», 26.09).
    expect(mainText.colorScheme).toBe("scheme-5");
    expect(mainText.textStyle).toBe("italic");
    expect(mainText.padding).toEqual({ top: 120, bottom: 120 });
    // Кнопка — в поле панели «Кнопка», не в скрытом legacy `cta`: иначе витрина
    // показывала кнопку при пустом инпуте (main-text-button-empty.spec.ts).
    expect(mainText.button).toEqual({
      text: "К покупкам",
      link: { href: "/catalog" },
    });
    expect(mainText).not.toHaveProperty("cta");

    // Video
    const video = blocks[5].props;
    expect(video.padded).toBe(true);
    expect(video.colorScheme).toBe("scheme-1");
    expect(video.padding).toEqual({ top: 120, bottom: 120 });

    // ImageWithText
    const iwt = blocks[6].props;
    expect(iwt.imagePosition).toBe("right");
    expect(iwt.ctaPosition).toBe("bottom-pinned");
    expect(iwt.colorScheme).toBe("scheme-5");
    expect(iwt.textStyle).toBe("italic");
    expect(iwt.padding).toEqual({ top: 120, bottom: 120 });

    // PopularProducts — 3×2 grid + pad 120
    const popular = blocks[7].props;
    expect(popular.swatchOverlay).toBe(true);
    expect(popular.cardCaptionStyle).toBe("uppercase");
    expect(popular.collection).toBe("mebel");
    expect(popular.cards).toBe(6);
    expect(popular.columns).toBe(3);
    expect(popular.colorScheme).toBe("scheme-3");
    expect(popular.padding).toEqual({ top: 120, bottom: 120 });

    // Newsletter
    const newsletter = blocks[8].props;
    expect(newsletter.formLayout).toBe("inline-submit");
    expect(newsletter.colorScheme).toBe("scheme-2");
    expect(newsletter.alignment).toBe("left");
    expect(newsletter.padding).toEqual({ top: 120, bottom: 120 });

    // Footer
    const footer = blocks[9].props;
    expect(footer.variant).toBe("2-part-asymmetric");
    expect(footer.bottomStrip).toMatchObject({
      enabled: true,
      text: expect.stringContaining("Powered by Merfy"),
    });
  });

  // 084 Stage 3 Task 6 (v11): vanilla-specific Catalog blockDefaults —
  // раньше их force-заливала миграция в page-catalog/page-collection на
  // КАЖДОМ чтении; теперь это просто явные пропы в пакетном сиде страниц.
  it("page-catalog.json несёт vanilla-specific Catalog defaults явно в пропах", () => {
    const raw = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          "../../../packages/theme-vanilla/pages/catalog.json",
        ),
        "utf-8",
      ),
    ) as Home;
    const catalog = raw.content.find((b) => b.type === "Catalog")!;
    expect(catalog.props.gridAspect).toBe("1:1");
    expect(catalog.props.cardCaptionStyle).toBe("uppercase");
    expect(catalog.props.colorScheme).toBe("scheme-3");
    expect(catalog.props.filterPosition).toBe("side");
    expect(catalog.props.columns).toBe(2);
    expect(catalog.props.cards).toBe(12);
    expect(catalog.props.padding).toEqual({ top: 120, bottom: 120 });
  });

  it("collection.json несёт те же vanilla-specific Catalog defaults (cards:12, не 24)", () => {
    const raw = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          "../../../packages/theme-vanilla/pages/collection.json",
        ),
        "utf-8",
      ),
    ) as Home;
    const catalog = raw.content.find((b) => b.type === "Catalog")!;
    expect(catalog.props.gridAspect).toBe("1:1");
    expect(catalog.props.cardCaptionStyle).toBe("uppercase");
    expect(catalog.props.colorScheme).toBe("scheme-3");
    expect(catalog.props.filterPosition).toBe("side");
    expect(catalog.props.columns).toBe(2);
    // Было 24 в пакете при 12 в бывшей VANILLA_CATALOG_DEFAULTS — миграция
    // форсом переписывала 24 → 12 на каждом чтении (подтверждено golden
    // до правки). Пакетный файл теперь хранит то же значение напрямую.
    expect(catalog.props.cards).toBe(12);
    expect(catalog.props.padding).toEqual({ top: 120, bottom: 120 });
  });
});
