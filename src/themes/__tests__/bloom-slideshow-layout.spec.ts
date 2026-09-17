/**
 * Bloom «Слайд-шоу»: заголовок не размера текста, блок не сжат в узкую
 * колонку, кнопка не режет подпись.
 *
 * ЖАЛОБА ВЛАДЕЛЬЦА (2026-09-17, баг b67). Замер реальным Chromium 1280×720
 * (пустое состояние) ДО правки:
 *   заголовок  20px (rose 40px), текст 16px (rose 20px)
 *   кнопка     85×48 (rose 160×52) — подпись «Кнопка» впритык
 *   блок       max-w-330 прижат в левый нижний угол
 * Причина: slideHeadingCls копировал лестницу ВСПОМОГАТЕЛЬНОГО подзаголовка
 * Hero (18/md:20 — тот же диапазон, что и текст 14/md:16), а не заголовка.
 *
 * ЧТО СТОРОЖИМ (три требования владельца дословно): «заголовок должен быть
 * заголовком (крупнее текста)», «блок не должен быть зажат в узкую колонку»,
 * «кнопка должна вмещать подпись». Не пиксель-в-пиксель с rose (эталон
 * поведения, не значений) — минимальные пороги, ниже которых заголовок
 * читается текстом, блок — колонкой, кнопка — обрезком.
 *
 * Требует сборки (гоча замера из тикета b67):
 *   pnpm build:theme-sections:all
 * Без пересборки dist/theme-css/bloom.css тест читает СТАРЫЙ бандл и врёт
 * зелёным по правленному исходнику.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { declaredValue, loadBundle, pxOf } from "../../../scripts/qa/lib";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
/** Опора замера владельца — тот же Chromium-вьюпорт, что и в баг-репорте. */
const DESKTOP_PX = 1280;

function renderSlideshow(): HTMLElement {
  const jobs = [
    {
      block: "Slideshow",
      cascade: true,
      live: true,
      props: {
        id: "bloom-slideshow-guard",
        slides: [],
        interval: 5,
        autoplay: true,
        padding: { top: 0, bottom: 0 },
      },
    },
  ];
  const raw = execFileSync("node", [RENDERER, "bloom", JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(`рендер Slideshow (bloom) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`);
  }
  return parse(row.html) as unknown as HTMLElement;
}

const bundle = () => loadBundle("bloom");

describe("bloom Slideshow: заголовок/блок/кнопка (баг b67)", () => {
  const root = renderSlideshow();
  const heading = root.querySelector("h1, h2");
  const text = root.querySelector("p");
  const button = root.querySelector("a");
  // Контейнер контент-блока — первый div с max-w-[…] внутри полотна слайда.
  const block = [...root.querySelectorAll("div")].find((d) =>
    /max-w-\[/.test(d.getAttribute("class") ?? ""),
  );

  it("нашёл заголовок, текст, кнопку и контент-блок в разметке пустого состояния", () => {
    expect(heading).toBeTruthy();
    expect(text).toBeTruthy();
    expect(button).toBeTruthy();
    expect(block).toBeTruthy();
  });

  it("заголовок ЗАМЕТНО крупнее абзаца (не размер обычного текста)", () => {
    const b = bundle();
    const headingPx = pxOf(b, heading as HTMLElement, ["font-size"], DESKTOP_PX);
    const textPx = pxOf(b, text as HTMLElement, ["font-size"], DESKTOP_PX);
    expect(headingPx).not.toBeNull();
    expect(textPx).not.toBeNull();
    // ДО правки: 20px/16px = 1.25 — заголовок «путался» с текстом.
    // Порог 1.6 отсекает откат к старой лестнице, не требуя копии rose (2.0).
    expect((headingPx as number) / (textPx as number)).toBeGreaterThanOrEqual(1.6);
    // Абсолютный пол — заголовок не должен становиться мельче исходных 20px.
    expect(headingPx as number).toBeGreaterThanOrEqual(28);
  });

  it("контент-блок не зажат в узкую колонку (было max-w-330)", () => {
    const b = bundle();
    const maxW = pxOf(b, block as HTMLElement, ["max-width"], DESKTOP_PX);
    expect(maxW).not.toBeNull();
    expect(maxW as number).toBeGreaterThanOrEqual(400);
  });

  it("кнопка вмещает подпись — не 85×48 (минимальная ширина + высота)", () => {
    const b = bundle();
    const minW = pxOf(b, button as HTMLElement, ["min-width"], DESKTOP_PX);
    const h = pxOf(b, button as HTMLElement, ["height"], DESKTOP_PX);
    expect(minW).not.toBeNull();
    expect(h).not.toBeNull();
    expect(minW as number).toBeGreaterThanOrEqual(140);
    expect(h as number).toBeGreaterThanOrEqual(48);
  });

  it("класс max-width заголовка/кнопки/блока реально есть в бандле темы (не призрак)", () => {
    const b = bundle();
    // declaredValue кидает громко, если ни один класс узла не побеждает по
    // свойству, — то есть класс не попал в собственный CSS темы (фантом).
    expect(() => declaredValue(b, heading as HTMLElement, ["font-size"], DESKTOP_PX)).not.toThrow();
    expect(() => declaredValue(b, button as HTMLElement, ["min-width"], DESKTOP_PX)).not.toThrow();
    expect(() => declaredValue(b, block as HTMLElement, ["max-width"], DESKTOP_PX)).not.toThrow();
  });
});
