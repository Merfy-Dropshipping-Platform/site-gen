import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderBlock } from "../../../scripts/qa/lib/render";

/**
 * Жирность и курсив в «Тексте согласия» подписки на рассылку.
 *
 * ЖАЛОБА ВЛАДЕЛЬЦА 21.09 со снимками панели: нажал «B» или «I» — и под формой
 * появилось «<strong>Согласен на обработку персональных данных и рекламы
 * </strong>» ТЕКСТОМ, вместе с тегами.
 *
 * ПРИЧИНА. Соседние поля той же секции (`heading`, `description`) выводятся
 * через `set:html={inlineFormat(...)}`, а текст согласия — обычной подстановкой
 * `{agreeText}`: Astro её экранирует, и теги превращаются в видимые символы.
 * У vanilla и flux это уже было сделано правильно — расхождение жило в трёх
 * темах из пяти, ровно «фича на одном пути из трёх».
 *
 * `inlineFormat` (themes/<t>/src/lib/rich-text.ts) снимает только парные теги
 * без атрибутов, поэтому обработчики `on*` через это поле не проедут.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "vanilla", "flux"] as const;
const TEXT = "Согласен на обработку персональных данных и рекламы";

const built = (theme: string) =>
  existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));

function render(theme: string, agreementText: string, link?: string): string {
  return renderBlock(theme, "Newsletter", {
    id: "Newsletter-1",
    colorScheme: "scheme-1",
    agreement: "true",
    agreementText,
    ...(link ? { agreementLink: link } : {}),
  });
}

describe("текст согласия принимает жирность и курсив", () => {
  const themes = THEMES.filter((t) => built(t));

  it("темы собраны — иначе проверки ниже сторожат пустоту", () => {
    expect(themes.length).toBeGreaterThan(0);
  });

  it.each([
    ["жирный", `<strong>${TEXT}</strong>`, "strong"],
    ["курсив", `<em>${TEXT}</em>`, "em"],
  ])("%s доезжает тегом, а не символами", (_имя, входной, тег) => {
    for (const theme of themes) {
      for (const link of [undefined, "https://example.com"]) {
        const html = render(theme, входной, link);
        const где = `${theme}${link ? " со ссылкой" : ""}`;
        expect({ где, экранировано: html.includes(`&lt;${тег}&gt;`) }).toEqual({
          где,
          экранировано: false,
        });
        expect({ где, тегом: new RegExp(`<${тег}>Согласен`).test(html) }).toEqual({
          где,
          тегом: true,
        });
      }
    }
  });

  it("обычный текст остаётся обычным текстом", () => {
    for (const theme of themes) {
      expect(render(theme, TEXT)).toContain(TEXT);
    }
  });

  it("поле выводится тем же способом, что соседние heading/description", () => {
    for (const theme of THEMES) {
      const src = readFileSync(
        resolve(SITES_ROOT, "themes", theme, "src/components/sections/Newsletter.astro"),
        "utf-8",
      );
      expect({ theme, есть: /set:html=\{inlineFormat\(agreeText\)\}/.test(src) }).toEqual({
        theme,
        есть: true,
      });
      // Голая подстановка возвращала бы баг — её быть не должно ни в одной ветке
      // (с ссылкой и без).
      expect({ theme, голая: />\{agreeText\}</.test(src) }).toEqual({ theme, голая: false });
    }
  });
});
