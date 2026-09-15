import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Подпись платформы в подвале не должна быть крупнее соседнего копирайта.
 *
 * Поймано 15.09 по скриншоту тестера: у satin полоса «Powered by Merfy» шла
 * 16px на десктопе против 12px копирайта рядом и против 14px у эталона rose
 * и у flux. Выглядело как «размеры в подвале неверные».
 */
const ROOT = join(__dirname, "..", "..", "..");
const strip = /class="text-center[^"]*"/;

const footerOf = (theme: string) =>
  readFileSync(
    join(ROOT, "themes", theme, "src", "components", "Footer.astro"),
    "utf8",
  );

/**
 * Размер подписи на десктопе: md:text-[Npx], иначе базовый text-[Npx].
 * Ищем в ОКНЕ вокруг вывода `{stripText}` — у rose и vanilla класс стоит
 * строкой выше самого вывода, поиск по одной строке их не находит.
 */
function stripSizePx(src: string): { desktop: number; mobile: number } | null {
  // комментарии не разметка: за смену они дважды обманули гарды
  const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const lines = code.split("\n");
  const at = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.includes("stripText") && !l.includes("const") && !l.includes("?"))
    .pop();
  if (!at) return null;
  const win = lines.slice(Math.max(0, at.i - 3), at.i + 2).join("\n");
  const base = /text-\[(\d+)px\]/.exec(win);
  if (!base) return null;
  const md = /md:text-\[(\d+)px\]/.exec(win);
  return { mobile: Number(base[1]), desktop: md ? Number(md[1]) : Number(base[1]) };
}

describe("подпись платформы в подвале", () => {
  it.each(["rose", "vanilla", "bloom", "satin"])(
    "%s: на десктопе не крупнее 14px",
    (theme) => {
      const size = stripSizePx(footerOf(theme));
      expect(size).not.toBeNull();
      expect(size!.desktop).toBeLessThanOrEqual(14);
    },
  );

  it("satin: подпись не крупнее копирайта более чем на 2px", () => {
    const src = footerOf("satin");
    const size = stripSizePx(src)!.desktop;
    const copyright = /text-\[(\d+)px\][^"]*"[^>]*>\{copyrightText\}/.exec(src);
    expect(copyright).not.toBeNull();
    expect(size - Number(copyright![1])).toBeLessThanOrEqual(2);
  });

  it("контроль: у эталона rose подпись 14px", () => {
    expect(stripSizePx(footerOf("rose"))!.desktop).toBe(14);
  });
});
