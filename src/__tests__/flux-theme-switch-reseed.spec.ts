import {
  shouldReseedOnThemeSwitch,
  THEMES_RESEED_ON_SWITCH,
} from "../sites.service";

/**
 * Spec 109-flux-parity / flux-theme-switch-settings (подход B, расширено на все темы):
 * при переключении темы НА любую тему верстальщиков ревизия пересеивается в полный
 * канон этой темы (defaults/<theme>.json или PageResolver для rose) — палитра/
 * раскладка/хром + товарные секции наполняются с нуля. Re-save той же темы — без сброса.
 *
 * shouldReseedOnThemeSwitch — чистое решение «пересеивать ли ревизию».
 */
describe("shouldReseedOnThemeSwitch (109)", () => {
  const base = {
    hasCurrentRevision: true,
    hasThemeSettings: true,
    resetContent: false,
    prevThemeId: "rose",
    nextThemeId: "rose",
  };

  // rose ВРЕМЕННО исключён — его defaults-канон не несёт light-схем (см. sites.service).
  const ALLOWED_THEMES = ["vanilla", "bloom", "satin", "flux"];

  it("allowlist = 4 темы с валидным каноном (rose исключён до починки)", () => {
    expect([...THEMES_RESEED_ON_SWITCH].sort()).toEqual(
      [...ALLOWED_THEMES].sort(),
    );
  });

  it("does NOT reseed when switching to rose (excluded pending canon fix)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        prevThemeId: "flux",
        nextThemeId: "rose",
      }),
    ).toBe(false);
  });

  it.each(ALLOWED_THEMES)(
    "reseeds when switching TO %s from a different theme (apply canon)",
    (theme) => {
      expect(
        shouldReseedOnThemeSwitch({
          ...base,
          prevThemeId: "rose",
          nextThemeId: theme,
        }),
      ).toBe(true);
    },
  );

  it.each(ALLOWED_THEMES)(
    "does NOT reseed on %s->%s re-save (preserve edits)",
    (theme) => {
      expect(
        shouldReseedOnThemeSwitch({
          ...base,
          prevThemeId: theme,
          nextThemeId: theme,
        }),
      ).toBe(false);
    },
  );

  it("does NOT reseed when switching to an UNKNOWN theme that already has settings", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        prevThemeId: "rose",
        nextThemeId: "totally-custom-theme",
      }),
    ).toBe(false);
  });

  it("reseeds a brand-new site with no current revision (legacy behaviour preserved)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        hasCurrentRevision: false,
        hasThemeSettings: false,
        prevThemeId: null,
        nextThemeId: "totally-custom-theme",
      }),
    ).toBe(true);
  });

  it("reseeds when current revision lacks themeSettings (legacy seed path preserved)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        hasThemeSettings: false,
        nextThemeId: "totally-custom-theme",
      }),
    ).toBe(true);
  });

  it("reseeds when resetContent is explicitly requested (legacy behaviour preserved)", () => {
    expect(
      shouldReseedOnThemeSwitch({
        ...base,
        resetContent: true,
        nextThemeId: "totally-custom-theme",
      }),
    ).toBe(true);
  });
});
