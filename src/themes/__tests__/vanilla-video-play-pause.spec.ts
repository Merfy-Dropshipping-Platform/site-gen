/**
 * vanilla «Видео» — три жалобы тестера 15.09, пункт [62], одна причина.
 *
 * До правки: play-иконка была ДЕКОРАТИВНЫМ `<svg pointer-events-none>` без
 * клика, рисовалась ВСЕГДА по центру независимо от состояния воспроизведения
 * [3]; сам `<video>` был `pointer-events-none` — поставить на паузу было
 * НЕЧЕМ [2]; при блокированном автоплее (типичный случай в iframe превью
 * конструктора) ролик навечно стоял на первом кадре под неподвижной
 * иконкой — тестер читает это как «бесконечная загрузка» [1].
 *
 * Починка: с видео — НАСТОЯЩАЯ `<button data-media-play-overlay>`, инлайн-
 * скрипт (block-root-scoped, `window.__merfyRoot`) переключает play/pause и
 * держит видимость кнопки синхронной с реальным состоянием (видна на паузе,
 * скрыта при игре, показывается сразу если автоплей не стартовал). Без
 * видео (пустой плейсхолдер) — decorative-иконка как была, кликать там
 * нечего и не должно быть.
 *
 * Требует сборки: pnpm build:blocks && pnpm build:theme-sections vanilla.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const BLOCK = "Video";
const THEME = "vanilla";

function render(props: Record<string, unknown>): string | null {
  const mf = resolve(SITES_ROOT, "dist", "theme-sections", THEME, "manifest.json");
  if (!existsSync(mf)) return null;
  const rows = JSON.parse(
    execFileSync("node", [RENDERER, THEME, JSON.stringify([{ block: BLOCK, props }])], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 128 * 1024 * 1024,
    }),
  ) as Array<{ html?: string; error?: string; missing?: boolean }>;
  const row = rows[0];
  expect(row?.error).toBeUndefined();
  expect(row?.missing).toBeFalsy();
  return row?.html ?? "";
}

describe("vanilla Video — play/pause больше не декоративный (репорт [62])", () => {
  it("dist собран (pnpm build:blocks && pnpm build:theme-sections vanilla)", () => {
    expect(
      existsSync(resolve(SITES_ROOT, "dist", "theme-sections", THEME, "manifest.json")),
    ).toBe(true);
  });

  it("с видео: НАСТОЯЩАЯ кнопка play/pause, не decorative-svg", () => {
    const html = render({ id: "vid-1", videoUrl: "/proof-video.mp4" });
    if (html === null) return;
    expect(html).toContain('data-media-play-overlay');
    // Кнопка — <button>, не голый <svg> без обёртки.
    expect(html).toMatch(/<button[^>]*data-media-play-overlay/);
  });

  it("с видео: <video> и кнопка НЕ pointer-events-none — паузу можно поставить [2]", () => {
    const html = render({ id: "vid-1", videoUrl: "/proof-video.mp4" });
    if (html === null) return;
    const videoTagMatch = html.match(/<video[^>]*>/);
    expect(videoTagMatch).not.toBeNull();
    expect(videoTagMatch![0]).not.toContain("pointer-events-none");
    const buttonTagMatch = html.match(/<button[^>]*data-media-play-overlay[^>]*>/);
    expect(buttonTagMatch).not.toBeNull();
    expect(buttonTagMatch![0]).not.toContain("pointer-events-none");
  });

  it("с видео: скрипт переключает play/pause через window.__merfyRoot (Spec 102 скоуп)", () => {
    const html = render({ id: "vid-1", videoUrl: "/proof-video.mp4" });
    if (html === null) return;
    expect(html).toContain("__merfyRoot(blockId)");
    expect(html).toContain('data-media-video');
    expect(html).toMatch(/v\.paused\s*\)\s*v\.play/);
    expect(html).toContain("v.pause()");
    // Синхронизация видимости с РЕАЛЬНЫМ состоянием (жалоба [1] и [3]): play
    // прячет, pause/ended показывают, и показывает СРАЗУ если автоплей не
    // стартовал (video.paused при загрузке).
    expect(html).toContain('addEventListener("play", hide)');
    expect(html).toContain('addEventListener("pause", show)');
    expect(html).toContain('addEventListener("ended", show)');
    expect(html).toContain("if (v.paused) show()");
  });

  it("без видео (плейсхолдер): decorative-иконка осталась, кнопки и скрипта нет", () => {
    const html = render({ id: "vid-1" });
    if (html === null) return;
    expect(html).not.toContain("data-media-play-overlay");
    expect(html).not.toContain("__merfyRoot");
    // Плейсхолдер сам по себе не регрессировал — иконка по центру осталась.
    expect(html).toMatch(/pointer-events-none absolute left-1\/2 top-1\/2/);
  });
});
