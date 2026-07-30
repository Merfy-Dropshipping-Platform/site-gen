/**
 * Фаза 1 — «Flux всегда собирается через themes-v2, legacy запрещён».
 *
 * `SiteGeneratorService.build` выбирает движок по `BUILD_PIPELINE_ENABLED`,
 * который по умолчанию `false`. Ветка themes-v2 живёт только внутри
 * `runBuildPipeline`, поэтому в legacy-режиме мигрированная тема собиралась
 * монолитом `buildWithAstro` — другим движком, но со статусом успеха. Локальная
 * машина и прод при этом собирали витрину РАЗНЫМИ сборщиками, из-за чего любое
 * локальное сравнение «превью против live» ничего не доказывало.
 */
import {
  MIGRATED_THEMES,
  assertPipelineModeForTheme,
} from "../build.service";

describe("assertPipelineModeForTheme — запрет legacy для мигрированных тем", () => {
  it("мигрированная тема в legacy-режиме роняет сборку", () => {
    expect(() => assertPipelineModeForTheme("flux", false)).toThrow(
      /собрана в legacy-режиме|legacy-режиме/,
    );
  });

  it("сообщение называет тему и способ починки", () => {
    let message = "";
    try {
      assertPipelineModeForTheme("flux", false);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('"flux"');
    expect(message).toContain("BUILD_PIPELINE_ENABLED=true");
  });

  it("мигрированная тема в pipeline-режиме проходит", () => {
    for (const theme of MIGRATED_THEMES) {
      expect(() => assertPipelineModeForTheme(theme, true)).not.toThrow();
    }
  });

  it("правило действует для КАЖДОЙ мигрированной темы", () => {
    for (const theme of MIGRATED_THEMES) {
      expect(() => assertPipelineModeForTheme(theme, false)).toThrow();
    }
  });

  it("немигрированная тема в legacy-режиме собирается как прежде", () => {
    expect(MIGRATED_THEMES.has("luna")).toBe(false);
    expect(() => assertPipelineModeForTheme("luna", false)).not.toThrow();
    expect(() => assertPipelineModeForTheme("default", false)).not.toThrow();
  });
});
