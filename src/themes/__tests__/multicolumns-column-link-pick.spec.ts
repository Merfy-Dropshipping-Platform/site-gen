/**
 * «После выбора ссылки в Мультиколоннах пропала кнопка колонны» (владелец, 26.09).
 *
 * Путь мерчанта: «Мультиколонны» → «Колонна» → «Название ссылки» → «Ссылка».
 * Выбиралка ссылки (PagePicker конструктора) пишет в `columns[i].link` ОБЪЕКТ
 * `{ href, text? }`. У колонок из стартового контента секции рядом лежит
 * легаси-поле `text` (описание колонки). Общая развёртка конвертов
 * (`coerceLegacyValue`, page-blocks.ts) принимала ЛЮБОЙ объект с `text`-строкой
 * и `link.href` за кнопку-конверт и схлопывала всю колонку в `{ text, href }`:
 * заголовок, «Название ссылки», картинка пропадали — в превью, после
 * перезагрузки и на витрине.
 *
 * Два уровня:
 *  1) adaptLegacyProps — колонка остаётся колонкой (быстро, без сборки);
 *  2) живая цепочка рантайма (adaptLegacyProps → blockDefaults → resolveBlockProps)
 *     + порт каждой из пяти тем: кнопка колонки нарисована с выбранным адресом.
 *     Нужны сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { adaptLegacyProps } from "../page-blocks";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const PLACEHOLDER_TEXT =
  "Сочетай текст, чтобы подчеркнуть плюсы товара или коллекции.";

/** Колонка стартового контента (MultiColumns.puckConfig defaults) после правки мерчанта. */
const pickedColumn = (link: Record<string, string>) => ({
  id: "col-1",
  heading: "Колонна",
  text: PLACEHOLDER_TEXT,
  imageUrl: "",
  linkText: "Подробнее",
  link,
});

/** Три вида значения выбиралки: страница, товар/коллекция (с подписью), свой адрес (без подписи). */
const PICKS = [
  { kind: "страница", link: { href: "/about", text: "О нас" } },
  {
    kind: "коллекция",
    link: { href: "/collections/novinki", text: "Новинки" },
  },
  { kind: "свой адрес", link: { href: "https://example.com" } },
] as const;

const sectionProps = (link: Record<string, string>) => ({
  id: "MultiColumns-probe",
  heading: "Мультиколонны",
  displayColumns: 3,
  columns: [pickedColumn(link)],
});

describe("Мультиколонны: выбор ссылки колонки не схлопывает колонку", () => {
  it.each(PICKS)(
    "adaptLegacyProps сохраняет колонку целиком ($kind)",
    ({ link }) => {
      const out = adaptLegacyProps(
        sectionProps({ ...link }),
        null,
        "MultiColumns",
      );
      const [column] = out.columns as Array<Record<string, unknown>>;

      expect(column).toMatchObject({
        heading: "Колонна",
        text: PLACEHOLDER_TEXT,
        linkText: "Подробнее",
        link: { href: link.href },
      });
    },
  );

  it("кнопка-конверт { text, link: { href } } по-прежнему разворачивается в { text, href }", () => {
    const out = adaptLegacyProps(
      {
        rows: [
          {
            id: "r1",
            button: {
              text: "Кнопка",
              link: { href: "/catalog", text: "Каталог" },
            },
          },
        ],
      },
      null,
      "MultiRows",
    );
    const [row] = out.rows as Array<Record<string, unknown>>;

    expect(row.button).toEqual({ text: "Кнопка", href: "/catalog" });
  });
});

type Row = {
  block: string;
  html?: string;
  error?: string;
  pipelineError?: string;
};

function renderLive(theme: string, props: Record<string, unknown>): Row {
  const jobs = [{ block: "MultiColumns", props, cascade: true, live: true }];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return (JSON.parse(raw) as Row[])[0];
}

/** Первая колонка секции — от первого <li> до его закрытия. */
const firstColumnHtml = (html: string): string =>
  html.split(/<li\b/)[1]?.split("</li>")[0] ?? "";

describe.each(THEMES)(
  "Мультиколонны %s: кнопка колонки после выбора ссылки",
  (theme) => {
    it.each(PICKS)("рисуется с выбранным адресом ($kind)", ({ link }) => {
      const row = renderLive(theme, sectionProps({ ...link }));
      expect(row.error ?? row.pipelineError).toBeUndefined();

      const column = firstColumnHtml(row.html ?? "");
      expect(column).toContain("Колонна");
      expect(column).toMatch(
        new RegExp(`<a\\b[^>]*href="${link.href.replace(/[/.]/g, "\\$&")}"`),
      );
    });
  },
);
