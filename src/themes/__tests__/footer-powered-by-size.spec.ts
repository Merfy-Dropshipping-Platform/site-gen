/**
 * Подпись платформы в подвале («Разработано на Merfy»).
 *
 * Раньше этот сторож держал просьбу тестера «не крупнее 14px и не крупнее
 * копирайта». Владелец 25.09 решил иначе: «размеры задаём мы, меняется только
 * если капс». Поэтому размер подписи здесь не проверяется вовсе — он такой,
 * как в теме. Проверяется одно: подпись не набрана капсом (`uppercase`) ни в
 * одной из пяти тем, ни с признаком «как у верстальщиков», ни без него (на
 * проде признак у всех сайтов).
 *
 * Проверка по ОТРИСОВАННОМУ подвалу (тот же модуль темы, что уходит на витрину),
 * а не по исходнику: капс может прийти классом на обёртке выше подписи.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */
import { renderSections } from "../../../scripts/qa/lib/render";

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
const MODES = [
  { name: "без признака", extra: {} },
  { name: "с признаком", extra: { __designParity: true } },
] as const;
const SIGN = "Разработано на Merfy";

/** Классы всех открытых на месте подписи тегов: от начала подвала до самой надписи. */
function classesAround(html: string): string[] {
  const at = html.indexOf(SIGN);
  if (at < 0) return [];
  const before = html.slice(0, at);
  const open: string[] = [];
  for (const m of before.matchAll(/<(\/?)([a-z0-9]+)\b([^>]*)>/gi)) {
    const [, closing, tag, attrs] = m;
    if (/^(img|br|input|meta|link|source|path|circle|line|rect)$/i.test(tag)) continue;
    if (closing) {
      open.pop();
      continue;
    }
    open.push(/class="([^"]*)"/.exec(attrs)?.[1] ?? "");
  }
  return open;
}

describe.each(MODES)("подпись платформы в подвале — $name", ({ extra }) => {
  it.each(THEMES)("%s: подпись есть и не набрана капсом", (theme) => {
    const [row] = renderSections(theme, [{ block: "Footer", props: { id: "Footer-1", ...extra } }]);
    if (!row?.html) throw new Error(`${theme}: ${row?.error ?? "нет html"}`);
    expect(row.html).toContain(SIGN);
    const upper = classesAround(row.html).filter((cls) => /(^|\s)uppercase(\s|$)/.test(cls));
    expect(upper).toEqual([]);
  });
});

describe("саботаж: капс на обёртке подписи ловится", () => {
  it("uppercase у родителя — красный", () => {
    const html = `<footer><div class="flex uppercase"><p class="text-[16px]">${SIGN}</p></div></footer>`;
    expect(classesAround(html).some((c) => /(^|\s)uppercase(\s|$)/.test(c))).toBe(true);
  });
  it("без капса — зелёный", () => {
    const html = `<footer><div class="flex"><p class="text-[16px]">${SIGN}</p></div></footer>`;
    expect(classesAround(html).some((c) => /(^|\s)uppercase(\s|$)/.test(c))).toBe(false);
  });
});
