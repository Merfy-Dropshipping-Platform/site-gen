/**
 * Подпись кнопки колонки «Мультиколонн» — одно правило для пяти тем
 * (владелец 26.09, после починки «кнопка пропадает при выборе ссылки»).
 *
 *  - подпись = «Название ссылки» (`linkText`), если заполнено;
 *  - пустое «Название ссылки» = кнопки нет (подсказка поля «Оставьте пустой,
 *    чтобы скрыть»);
 *  - имя выбранной страницы/коллекции/товара (`link.text` из выбиралки)
 *    подписью НЕ становится;
 *  - старый формат стартового контента `link: {text, href, enabled}` без поля
 *    «Название ссылки» рисуется как раньше (так лежит в живых ревизиях).
 *
 * Было: rose/vanilla/flux/bloom брали подпись из `link.text` раньше
 * `linkText` («О нас» вместо «Подробнее»), satin при пустом поле подставлял
 * `link.text` и кнопку не скрывал.
 *
 * Уровни: правило (`multiColumnLink`) и порт каждой темы через живую цепочку
 * рантайма. Нужны сборки: pnpm build && pnpm build:blocks &&
 * pnpm build:theme-sections:all.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { multiColumnLink } from "../../../packages/theme-base/runtime/multicolumn-link";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const PICKED = { href: "/about", text: "О нас" };

type Case = {
  name: string;
  column: Record<string, unknown>;
  expected: { text: string; href: string } | undefined;
};

const CASES: Case[] = [
  {
    name: "«Название ссылки» главнее имени выбранной страницы",
    column: { linkText: "Подробнее", link: PICKED },
    expected: { text: "Подробнее", href: "/about" },
  },
  {
    name: "пустое «Название ссылки» скрывает кнопку",
    column: { linkText: "", link: PICKED },
    expected: undefined,
  },
  {
    name: "одни пробелы в «Названии ссылки» скрывают кнопку",
    column: { linkText: "   ", link: PICKED },
    expected: undefined,
  },
  {
    name: "без «Названия ссылки» имя страницы подписью не становится",
    column: { link: PICKED },
    expected: undefined,
  },
  {
    name: "свой адрес строкой",
    column: { linkText: "Подробнее", link: "https://example.com" },
    expected: { text: "Подробнее", href: "https://example.com" },
  },
  {
    name: "без ссылки кнопка ведёт в каталог",
    column: { linkText: "Подробнее", link: "" },
    expected: { text: "Подробнее", href: "/catalog" },
  },
  {
    name: "старый формат {text, href, enabled} рисуется как раньше",
    column: { link: { href: "#", text: "Ссылка", enabled: "true" } },
    expected: { text: "Ссылка", href: "#" },
  },
  {
    name: "старый формат с enabled=false скрыт",
    column: { link: { href: "#", text: "Ссылка", enabled: "false" } },
    expected: undefined,
  },
];

describe("multiColumnLink — правило подписи кнопки колонки", () => {
  it.each(CASES)("$name", ({ column, expected }) => {
    expect(multiColumnLink(column)).toEqual(expected);
  });
});

type Row = {
  block: string;
  html?: string;
  error?: string;
  pipelineError?: string;
};

function renderColumns(theme: string, columns: unknown[]): string {
  const props = { id: "MultiColumns-probe", heading: "Мультиколонны", columns };
  const jobs = [{ block: "MultiColumns", props, cascade: true, live: true }];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const [row] = JSON.parse(raw) as Row[];
  expect(row.error ?? row.pipelineError).toBeUndefined();
  return row.html ?? "";
}

/** Ссылки внутри каждой колонки (<li>): [{text, href}] по порядку колонок. */
function columnLinks(html: string): Array<Array<{ text: string; href: string }>> {
  return html
    .split(/<li\b/)
    .slice(1)
    .map((li) => li.split("</li>")[0])
    .map((li) =>
      [...li.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
        (m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }),
      ),
    );
}

describe.each(THEMES)("Мультиколонны %s: подпись кнопки колонки", (theme) => {
  const columns = CASES.map(({ column }, i) => ({
    id: `col-${i + 1}`,
    title: `Колонна ${i + 1}`,
    description: "Текст",
    ...column,
  }));
  let links: Array<Array<{ text: string; href: string }>> = [];

  beforeAll(() => {
    links = columnLinks(renderColumns(theme, columns));
  });

  it("рисует все колонки", () => {
    expect(links).toHaveLength(CASES.length);
  });

  it.each(CASES.map((c, i) => ({ ...c, i })))("$name", ({ expected, i }) => {
    expect(links[i]).toEqual(expected ? [expected] : []);
  });

  it("пустое состояние секции по-прежнему показывает «Кнопка» в каждой колонке", () => {
    const placeholder = columnLinks(renderColumns(theme, []));
    expect(placeholder.length).toBeGreaterThan(0);
    placeholder.forEach((col) => expect(col.map((l) => l.text)).toEqual(["Кнопка"]));
  });
});
