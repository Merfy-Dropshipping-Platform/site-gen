/**
 * Картинки слайдов грузятся сразу, а не «лениво».
 *
 * Жалоба владельца 18.09, п.26: «Слайд-шоу — не применяется медиафайл в
 * слайде». Воспроизведено вживую в боевом конструкторе: мерчант выбирает фото
 * во ВТОРОМ слайде, файл уходит в хранилище, ревизия его сохраняет, сервер
 * возвращает разметку С картинкой — а в превью слайд остаётся пустым, пока
 * страницу не перезагрузят.
 *
 * ЗАМЕР (живое превью, свойства самого `img`): у слайда с новой картинкой
 * `complete: false`, `naturalWidth: 0` — изображение НЕ загружено; тот же URL,
 * запрошенный отдельным `new Image()`, приходит за миллисекунды
 * (`naturalWidth: 64`). Атрибут — `loading="lazy"`.
 *
 * Причина: слайды лежат друг на друге (`absolute inset-0`) и переключаются
 * сменой `opacity`. У скрытого слайда браузер ленивую картинку не грузит, а
 * когда слайд показывают — загрузку уже не начинает: наблюдатель видимости от
 * смены `opacity` не пересчитывается. Первый слайд был `eager` и работал, все
 * последующие — нет. Отсюда и «медиафайл не применяется»: баг проявлялся
 * ровно со второго слайда.
 *
 * Сторожим исходники всех пяти тем: ни одна картинка слайда не должна нести
 * `loading="lazy"` — ни константой, ни выражением вида
 * `loading={i === 0 ? "eager" : "lazy"}`. Слайдов максимум пять, экономить на
 * их загрузке нечего. Проверка идёт по исходнику, а не по рендеру, потому что
 * изолированный рендер секции доступен не во всех темах (у части тем
 * `Slideshow` приходит из общего пакета).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITES_ROOT = join(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const slideshowSource = (theme: string): string =>
  readFileSync(join(SITES_ROOT, `themes/${theme}/src/components/sections/Slideshow.astro`), "utf-8");

/** Строки, где картинке слайда назначают ленивую загрузку (комментарии не в счёт). */
const lazyLines = (src: string): string[] =>
  src
    .split("\n")
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => {
      const code = line.replace(/\/\/.*$/, "");
      if (/^\s*\*/.test(code)) return false;
      if (!/loading\s*=/.test(code)) return false;
      return /["']lazy["']/.test(code);
    })
    .map(([i, line]) => `${i}: ${line.trim()}`);

describe("картинки слайдов не ленивые", () => {
  it.each(THEMES)("%s — ни одна картинка слайда не помечена lazy", (theme) => {
    expect(lazyLines(slideshowSource(theme))).toEqual([]);
  });

  it.each(THEMES)("%s — картинка слайда вообще существует и ей задан loading", (theme) => {
    const src = slideshowSource(theme);
    // Без этой проверки сторож стал бы зелёным от одного лишь отсутствия строки
    // (например, если картинку слайда вообще уберут из разметки).
    expect(src).toMatch(/loading\s*=\s*["{]/);
    expect(src).toMatch(/loading="eager"/);
  });

  it("САБОТАЖ: критерий действительно ловит обе формы записи", () => {
    expect(lazyLines('  <img loading="lazy" />')).toHaveLength(1);
    expect(lazyLines('  <img loading={i === 0 ? "eager" : "lazy"} />')).toHaveLength(1);
    expect(lazyLines('  // было loading="lazy" — снято')).toHaveLength(0);
    expect(lazyLines('  <img loading="eager" />')).toHaveLength(0);
  });
});
