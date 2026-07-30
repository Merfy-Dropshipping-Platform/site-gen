import fs from "node:fs";
import path from "node:path";
import { ThemeManifestSchema } from "../../theme-contract/validators/ThemeManifestSchema";

// Task 9 (111-flux-layout-parity): the 9 canonical section types that make
// up the Flux home page (docs/superpowers/plans/2026-07-27-flux-constructor-
// live-markup.md HOME_ORDER). Used below to assert these all resolve their
// Puck config from @merfy/theme-base (no Flux package override) and that
// the V2 render pipeline (sections.map.json) maps every one of them
// independently of theme.json's blocks/override mechanism.
const HOME_ORDER = [
  "PromoBanner",
  "Header",
  "Hero",
  "Collections",
  "Product",
  "PopularProducts",
  "ImageWithText",
  "Gallery",
  "Footer",
];

describe("@merfy/theme-flux theme.json", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "theme.json"), "utf-8"),
  );

  it("matches ThemeManifestSchema", () => {
    const result = ThemeManifestSchema.safeParse(manifest);
    if (!result.success) {
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('has id "flux"', () => {
    expect(manifest.id).toBe("flux");
  });

  it("extends @merfy/theme-base", () => {
    expect(manifest.extends).toMatch(/^@merfy\/theme-base@/);
  });

  it("has exactly 4 color schemes (dark+orange accent)", () => {
    expect(manifest.colorSchemes.length).toBe(4);
    const names = manifest.colorSchemes.map((s: { name: string }) => s.name);
    expect(names).toEqual(["1", "2", "3", "4"]);
  });

  it("first scheme has required color tokens", () => {
    const first = manifest.colorSchemes[0];
    const required = [
      "--color-bg",
      "--color-surface",
      "--color-heading",
      "--color-text",
      "--color-muted",
      "--color-primary",
      "--color-accent",
      "--color-button-bg",
      "--color-button-text",
      "--color-button-border",
      "--color-button-2-bg",
      "--color-button-2-text",
      "--color-button-2-border",
    ];
    for (const key of required) {
      expect(first.tokens[key]).toBeDefined();
    }
  });

  // Радиус кнопки — 4px, а не 6px: столько в вёрстке верстальщиков
  // (flux-theme Hero.astro:64 `rounded-[4px]`) и столько же показывает замер
  // живого flux.merfy.ru. Прежние 6px в манифест попали не из вёрстки.
  it("defaults express flux signature: 1320px container + 4px buttons + 12px cards", () => {
    expect(manifest.defaults["--container-max-width"]).toBe("1320px");
    expect(manifest.defaults["--radius-button"]).toBe("4px");
    expect(manifest.defaults["--radius-card"]).toBe("12px");
    expect(manifest.defaults["--radius-input"]).toBe("8px");
  });

  // Текстовые цвета темы = литералы вёрстки: заголовки #000000, вторичный
  // текст #999999 (замер flux.merfy.ru — единообразно во всех секциях).
  it("text colors match the reference: black headings, #999999 body", () => {
    expect(manifest.defaults["--color-heading"]).toBe("0 0 0");
    expect(manifest.defaults["--color-text"]).toBe("153 153 153");
  });

  it("declares Roboto Flex + Barlow fonts", () => {
    const families = manifest.fonts.map((f: { family: string }) => f.family);
    expect(families).toContain("Roboto Flex");
    expect(families).toContain("Barlow");
  });

  // Акцент flux — тёмно-синий #1e2952 (rgb 30 41 82), а НЕ оранжевый #fa5109.
  // Оранжевый пришёл из spec-111 FR-008, но на живом flux.merfy.ru его ноль
  // вхождений: кнопки, промо-полоса и бейдж корзины — все #1e2952.
  it("navy accent #1e2952 is used by buttons in every scheme", () => {
    for (const scheme of manifest.colorSchemes) {
      expect(scheme.tokens["--color-button-bg"]).toBe("30 41 82");
      expect(scheme.tokens["--color-button-border"]).toBe("30 41 82");
    }
  });

  // Схема по умолчанию называется ЯВНО, а не «первая в массиве»: иначе смена
  // дефолта требует перестановки массива, id перестают идти подряд
  // (scheme-2, scheme-1, …) и расходятся с остальными темами.
  it("default scheme is declared by id and ids stay sequential", () => {
    expect(manifest.defaultScheme).toBe("scheme-2");
    const ids = manifest.colorSchemes.map((s: { id: string }) => s.id);
    expect(ids).toEqual(ids.map((_: string, i: number) => `scheme-${i + 1}`));
    expect(ids).toContain(manifest.defaultScheme);
  });

  // Task 9 (111-flux-layout-parity, Step 1/2): the stale package-level
  // Header override (packages/theme-flux/blocks/Header/ — 4 files, no
  // Header.astro, dead since before the V2 architecture) is removed.
  // Header/Footer both now resolve their Puck config from @merfy/theme-base,
  // same as every other one of the 9 canonical home-page block types below.
  // The visual V2 renderer (themes/flux/src/components/Header.astro /
  // Footer.astro) is unaffected — it's wired via sections.map.json, not via
  // theme.json's blocks/override mechanism (see the dedicated block below).
  it("does not declare a package override for Header or Footer (V2 resolves both from theme-base)", () => {
    expect(manifest.blocks.Header?.override).toBeUndefined();
    expect(manifest.blocks.Footer?.override).toBeUndefined();
  });

  it("no canonical home-page block declares a package override (all 9 resolve from theme-base)", () => {
    for (const type of HOME_ORDER) {
      expect(manifest.blocks?.[type]?.override).toBeUndefined();
    }
  });

  it("the stale packages/theme-flux/blocks/Header directory no longer exists", () => {
    const headerOverrideDir = path.resolve(__dirname, "..", "blocks", "Header");
    expect(fs.existsSync(headerOverrideDir)).toBe(false);
  });

  it("V2 renderer (sections.map.json) maps all 9 canonical home-page block types independently of theme.json overrides", () => {
    const sectionsMap = JSON.parse(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "..",
          "..",
          "..",
          "themes",
          "flux",
          "sections.map.json",
        ),
        "utf-8",
      ),
    );
    for (const type of HOME_ORDER) {
      expect(typeof sectionsMap[type]).toBe("string");
      expect(sectionsMap[type].length).toBeGreaterThan(0);
    }
  });

  it("Footer newsletter is enabled by default (blockDefaults.Footer.newsletter.enabled)", () => {
    expect(manifest.blockDefaults.Footer.newsletter).toBeDefined();
    expect(manifest.blockDefaults.Footer.newsletter.enabled).toBe(true);
  });

  it("PromoBanner blockDefaults match the established reference (dark scheme-1, no hardcoded marketing copy — a fresh merchant-added instance starts from the Figma empty state, not from home.json seed copy)", () => {
    expect(manifest.blockDefaults.PromoBanner).toEqual({
      colorScheme: "scheme-1",
    });
  });

  it('Hero blockDefaults match the established reference (overlay variant, no blockDefaults content override — component-level fallback produces "Технологии без паузы")', () => {
    expect(manifest.blocks.Hero.variant).toBe("overlay");
    expect(manifest.blockDefaults.Hero).toEqual({});
  });

  it("Product blockDefaults carry Flux-specific visualConfig (inline-small gallery, dropdown variants, pill counter, description hidden)", () => {
    expect(manifest.blockDefaults.Product).toEqual({
      visualConfig: {
        gallery: { variant: "inline-small", showDiscountBadge: false },
        variantsType: "dropdown",
        counter: { variant: "pill" },
        showDescription: false,
      },
    });
  });

  it("ImageWithText blockDefaults carry the Flux dark scheme-1 default", () => {
    expect(manifest.blockDefaults.ImageWithText).toEqual({
      colorScheme: "scheme-1",
    });
  });
});
