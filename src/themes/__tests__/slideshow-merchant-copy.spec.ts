import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Баг тестера (18.09, Vanilla): «„Слайд-шоу“ ▸ „Слайд“ — доезжает только
 * „Заголовок“. „Текст“, „Кнопка“, „Ссылка“, „Позиция“ — нет, data-slides-json
 * держит старые subtitle/ctaText/ctaHref».
 *
 * Замер рендером (все пять тем) показал причину: когда в слайде лежат И старое
 * поле сида, И новое из панели, побеждало СТАРОЕ — порт читал
 * `s.subtitle ?? s.text.content` и `s.ctaText ?? s.button.text`. Легаси почти
 * всегда заполнено сидом, поэтому ввод мерчанта не доезжал никогда.
 *
 * Тем же приёмом в этом же файле уже чинили «Изображение (старое)»: там канон
 * панели стоит первым, а комментарий объясняет ровно этот механизм.
 *
 * Гард рендерит РЕАЛЬНЫЙ модуль темы (тот, что уходит на витрину), а не читает
 * исходник: имена переменных в пяти портах разные, а поведение должно совпадать.
 *
 * Требует собранных секций: pnpm build:theme-sections <тема>.
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "flux", "bloom", "satin", "vanilla"] as const;

/** Ревизия мерчанта: легаси от сида + то, что он ввёл в панели. */
const PROPS = {
  id: "Slideshow-1",
  colorScheme: "1",
  padding: { top: 40, bottom: 40 },
  slides: [
    {
      id: "s1",
      image: "",
      imageUrl: "",
      heading: { text: "ЗАГОЛОВОК", size: "medium" },
      subtitle: "ЛЕГАСИ-ТЕКСТ",
      text: { content: "ВВЕДЁННЫЙ-ТЕКСТ", size: "medium" },
      ctaText: "ЛЕГАСИ-КНОПКА",
      ctaUrl: "/legacy",
      button: { text: "ВВЕДЁННАЯ-КНОПКА", link: "/merchant" },
    },
  ],
};

function render(theme: string): string {
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Slideshow", props: PROPS }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}: ${res.error}`);
  return res.html ?? "";
}

describe("слайд показывает то, что ввёл мерчант, а не легаси сида", () => {
  it.each(THEMES)("%s: текст слайда", (theme) => {
    const html = render(theme);
    expect(html).toContain("ВВЕДЁННЫЙ-ТЕКСТ");
    expect(html).not.toContain("ЛЕГАСИ-ТЕКСТ");
  });

  it.each(THEMES)("%s: кнопка слайда", (theme) => {
    const html = render(theme);
    expect(html).toContain("ВВЕДЁННАЯ-КНОПКА");
    expect(html).not.toContain("ЛЕГАСИ-КНОПКА");
  });
});
