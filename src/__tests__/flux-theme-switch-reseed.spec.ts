import { shouldReseedOnThemeSwitch } from "../sites.service";

/**
 * Spec 109-flux-parity / flux-theme-switch-settings (подход B):
 * при переключении темы НА flux ревизия пересеивается в полный канон
 * верстальщиков (defaults/flux.json) — палитра/раскладка/хром + товарные
 * секции с dataSource:auto заполняются с нуля. Прочие темы — без изменений.
 *
 * shouldReseedOnThemeSwitch — чистое решение «пересеивать ли ревизию».
 */
describe("shouldReseedOnThemeSwitch (109 flux)", () => {
  const base = {
    hasCurrentRevision: true,
    hasThemeSettings: true,
    resetContent: false,
    prevThemeId: "vanilla",
    nextThemeId: "vanilla",
  };

  it("reseeds when switching TO flux from another theme (apply verstalshchiki canon)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        prevThemeId: "vanilla",
        nextThemeId: "flux",
      }),
    ).toBe(true);
  });

  it("does NOT reseed on flux->flux re-save (preserve flux edits)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        prevThemeId: "flux",
        nextThemeId: "flux",
      }),
    ).toBe(false);
  });

  it("does NOT reseed when switching to a NON-flux theme that already has settings (scope: flux-only)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        prevThemeId: "flux",
        nextThemeId: "rose",
      }),
    ).toBe(false);
  });

  it("reseeds a brand-new site with no current revision (legacy behaviour preserved)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        hasCurrentRevision: false,
        hasThemeSettings: false,
        nextThemeId: "rose",
      }),
    ).toBe(true);
  });

  it("reseeds when current revision lacks themeSettings (legacy seed path preserved)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        hasThemeSettings: false,
        nextThemeId: "rose",
      }),
    ).toBe(true);
  });

  it("reseeds when resetContent is explicitly requested (legacy behaviour preserved)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        resetContent: true,
        nextThemeId: "rose",
      }),
    ).toBe(true);
  });
});
