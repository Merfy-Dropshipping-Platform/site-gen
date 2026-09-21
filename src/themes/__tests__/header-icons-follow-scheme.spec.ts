import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Жалоба владельца (документ «баги шапки и меню», четыре пункта по vanilla,
 * bloom и satin): «в схеме заданы Заголовок и Текст — текст меню перекрасился, а
 * иконки поиска, избранного, корзины и профиля остались прежними».
 *
 * Причина механическая: NtIcon дизайн-системы рендерит `<img src="/icons/X.svg">`,
 * а <img> нельзя перекрасить CSS-цветом. У vanilla поверх этого висел фильтр
 * `brightness-0 invert`, принудительно делавший иконки белыми, — цвет схемы не
 * показался бы и после инлайна.
 *
 * В rose это было решено ещё раньше (RoseNtIcon + ROSE_ICON_SVGS). Здесь тот же
 * приём поднят в общий примитив `theme-base/primitives/SchemeIcon.astro`, а карты
 * инлайн-SVG генерируются из СОБСТВЕННЫХ файлов каждой темы — геометрия иконок у
 * тем разная, общая карта подменила бы одни иконки другими.
 *
 * Замер живой цепочкой до правки: иконка `<img>` у bloom/flux/satin/vanilla,
 * `<svg>` у rose. После: `<svg>` во всех пяти, и цвет следует --color-text.
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "bloom", "flux", "satin", "vanilla"] as const;

const LINKS = [
  { text: "Главная", href: "/" },
  { text: "Каталог", href: "/catalog" },
];

function renderHeader(theme: string): string {
  const props = {
    id: "Header-1",
    colorScheme: "scheme-2",
    logoPosition: "center-left",
    menuType: "dropdown",
    navigationLinks: LINKS,
    links: LINKS,
  };
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}: ${res.error}`);
  return res.html ?? "";
}

/** Кусок разметки кнопки действия вместе с её иконкой. */
function actionMarkup(html: string, label: string): string {
  const at = html.indexOf(`aria-label="${label}"`);
  if (at < 0) return "";
  // от начала тега до закрытия кнопки/ссылки
  const start = html.lastIndexOf("<", at);
  const end = html.indexOf(
    ">",
    html.indexOf(label === "Меню" ? "</button>" : "</", at),
  );
  return html.slice(start, end > start ? end : at + 900);
}

// «Избранное» добавлено намеренно: у flux оно рисуется отдельным компонентом
// FluxWishlistLink, и при первом заходе я его пропустила — гард без этой метки
// пропуск не поймал бы.
const ACTIONS = ["Поиск", "Избранное", "Корзина", "Аккаунт"];

describe("иконки шапки следуют цветовой схеме", () => {
  const rendered = new Map<string, string>();
  beforeAll(() => {
    for (const theme of THEMES) rendered.set(theme, renderHeader(theme));
  }, 180000);

  it.each(THEMES)("%s: иконки действий — инлайн-SVG, а не <img>", (theme) => {
    const html = rendered.get(theme)!;
    for (const label of ACTIONS) {
      const markup = actionMarkup(html, label);
      if (!markup) continue; // не у всех тем есть все три кнопки
      expect({
        theme,
        label,
        картинкой: markup.includes('<img src="/icons/'),
      }).toEqual({
        theme,
        label,
        картинкой: false,
      });
    }
  });

  it.each(THEMES)("%s: цвет иконок взят из токена схемы", (theme) => {
    const html = rendered.get(theme)!;
    expect(html).toMatch(
      /<svg[^>]*class="[^"]*text-\[rgb\(var\(--color-(text|button-text)/,
    );
  });

  it.each(THEMES)(
    "%s: у иконок нет currentColor-убийц (фильтр инверсии)",
    (theme) => {
      const html = rendered.get(theme)!;
      // brightness-0 гасит цвет в чёрный до инверсии — с currentColor это
      // означало бы «схема не действует». У vanilla такой фильтр стоял на КАЖДОЙ
      // иконке шапки и был снят вместе с переходом на инлайн-SVG.
      const svgTags = html.match(/<svg[^>]*>/g) ?? [];
      for (const tag of svgTags) {
        expect({
          theme,
          tag: tag.slice(0, 80),
          фильтр: /brightness-0/.test(tag),
        }).toEqual({
          theme,
          tag: tag.slice(0, 80),
          фильтр: false,
        });
      }
    },
  );
});
