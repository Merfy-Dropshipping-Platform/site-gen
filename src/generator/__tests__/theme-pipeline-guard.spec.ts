/**
 * Фаза 1, Gate 1 — «сборка не имеет silent fallback».
 *
 * Мигрированная тема без пред-собранного диста раньше молча собиралась legacy
 * scaffold'ом и получала статус "uploaded". Витрина при этом отдавалась другим
 * движком, чем превью, из-за чего любое сравнение «превью против live» давало
 * ложный результат. Гейт обязан падать, а не подменять конвейер.
 */
import {
  MIGRATED_THEMES,
  resolveThemePipeline,
} from "../build.service";

describe("resolveThemePipeline — запрет молчаливого fallback", () => {
  it("мигрированная тема с дистом собирается через themes-v2", () => {
    expect(resolveThemePipeline("flux", true)).toBe("themes-v2");
  });

  it("мигрированная тема БЕЗ диста роняет сборку, а не уходит в legacy", () => {
    expect(() => resolveThemePipeline("flux", false)).toThrow(
      /Legacy scaffold для мигрированных тем запрещён/,
    );
  });

  it("сообщение об ошибке называет тему и недостающий файл", () => {
    let message = "";
    try {
      resolveThemePipeline("flux", false);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('"flux"');
    expect(message).toContain("theme-live/flux/index.html");
    expect(message).toContain("pnpm build:themes");
  });

  it("правило действует для КАЖДОЙ мигрированной темы, не только flux", () => {
    for (const theme of MIGRATED_THEMES) {
      expect(resolveThemePipeline(theme, true)).toBe("themes-v2");
      expect(() => resolveThemePipeline(theme, false)).toThrow();
    }
  });

  it("немигрированная тема по-прежнему собирается legacy без падения", () => {
    expect(MIGRATED_THEMES.has("luna")).toBe(false);
    expect(resolveThemePipeline("luna", false)).toBe("legacy");
    expect(resolveThemePipeline("unknown-theme", false)).toBe("legacy");
  });
});
