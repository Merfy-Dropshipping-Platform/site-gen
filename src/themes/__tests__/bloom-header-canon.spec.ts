import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { migrateRevisionData } from "../../utils/revision-migrations";

/**
 * Жалоба владельца 20.09 по шапке bloom: «иконки большие» и «отступов сверху
 * и снизу нет». Оба пункта сверены с ЭТАЛОНОМ ВЕРСТАЛЬЩИКОВ — в нём десктопные
 * Поиск/Корзина/Аккаунт несут `size-5` (20px) в кнопке `size-8`, а обёртка
 * десктопа — `px-20 py-6` (24px по вертикали).
 *
 * Замер живой витрины до правки: иконки 24px, инлайн-стиль обёртки
 * `padding-top:0;padding-bottom:0`, меню упиралось в нижний край шапки.
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SEEDS_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "theme-bloom",
  "pages",
);

const LINKS = [
  { text: "Каталог", href: "/catalog" },
  { text: "О нас", href: "/about" },
];

function renderHeader(logoPosition: string): string {
  const props = {
    id: "Header-1",
    colorScheme: "2",
    logoPosition,
    navigationLinks: LINKS,
    links: LINKS,
  };
  const out = execFileSync(
    "node",
    [
      RENDERER,
      "bloom",
      JSON.stringify([{ block: "Header", props, live: true }]),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`bloom/${logoPosition}: ${res.error}`);
  return res.html ?? "";
}

/** Иконки десктопных рядов: всё, что идёт после мобильной строки `md:hidden`. */
function desktopPart(html: string): string {
  const cut = html.indexOf("max-w-[1920px]");
  return cut > 0 ? html.slice(cut) : html;
}

const LAYOUTS = ["top-center", "top-left", "center-left", "center-absolute"];

describe("шапка bloom: размер иконок по эталону верстальщиков", () => {
  it.each(LAYOUTS)(
    "%s: десктопные иконки — size-5, ни одной size-6",
    (layout) => {
      const desktop = desktopPart(renderHeader(layout));
      // хотя бы одна иконка отрисована
      expect(desktop).toMatch(/size-5/);
      // размер верстальщиков 24px (size-6) вернуться не должен
      expect(desktop).not.toMatch(/size-6/);
    },
  );
});

describe("шапка bloom: сид не обнуляет отступы", () => {
  const seeds = readdirSync(SEEDS_DIR).filter((f) => f.endsWith(".json"));

  it("сидов страниц найдено", () => {
    expect(seeds.length).toBeGreaterThan(5);
  });

  it.each(seeds)("%s: у шапки канонные отступы {16,16}, не нули", (file) => {
    const raw = readFileSync(join(SEEDS_DIR, file), "utf8");
    const found: Array<Record<string, unknown>> = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "Header" && n.props && typeof n.props === "object") {
        found.push(n.props as Record<string, unknown>);
      }
      Object.values(n).forEach(walk);
    };
    walk(JSON.parse(raw));
    for (const props of found) {
      const pad = props.padding as
        | { top?: unknown; bottom?: unknown }
        | undefined;
      if (!pad) continue;
      // Позитивный факт (не только «не ноль»): пакетный сид ДАЁТ канон
      // {16,16} сам по себе, с создания магазина — без read-time миграции.
      expect({ file, ...pad }).toEqual({ file, top: 16, bottom: 16 });
    }
  });
});

/**
 * 2026-09-23 (vanilla-seed-into-package): `migrateBloomHeaderPadding`
 * (read-time миграция, чинившая только `bloom` через `if (themeId ===
 * 'bloom')`) удалена — тема - это данные её пакета, не код на общем пути
 * чтения ревизии. Правило владельца: в платформе не должно быть веток «под
 * одну тему».
 *
 * Замер (см. `merfy-mcp/docs/proofs/p2-vanilla-seed-into-package.txt`, п.1):
 * `filterSeededPagesOnWrite` (B17) никогда не отсекает `home`, а
 * `seedContentPagesFromTheme` её не досевает — значит РЕЗУЛЬТАТ read-time
 * фикса, который раньше был ЭФЕМЕРНЫМ (не писался в БД, пока мерчант не
 * сохранял магазин), был ЕДИНСТВЕННЫМ способом починки для непересохранённых
 * старых bloom-магазинов. Он ушёл — два факта заменяют его:
 *
 *   1. Пакетный сид (см. describe выше «сид не обнуляет отступы») ДАЁТ канон
 *      {16,16} с самого создания магазина — новый bloom-магазин корректен без
 *      миграции вообще.
 *   2. Read-путь (`migrateRevisionData`) теперь НЕ трогает `padding` Header
 *      вовсе — ни для bloom, ни для какой-либо другой темы: значение, каким
 *      бы оно ни было (в т.ч. унаследованный сидовый {0,0} у СТАРЫХ, ни разу
 *      не пересохранённых магазинов), проходит без изменений.
 *
 * Существующие bloom-магазины, у которых {0,0} УЖЕ вморожен в ревизию
 * (сохранены хотя бы раз ДО фикса пакетного сида) — чинятся не read-time
 * миграцией, а одноразовым скриптом `scripts/reseed-untouched-home.ts`
 * (TARGET=bloom-header-padding, написан, не запущен).
 */
describe("миграция: read-путь не трогает padding Header ни для одной темы", () => {
  const revision = (padding: unknown) => ({
    pagesData: {
      home: {
        content: [{ type: "Header", props: { id: "Header-1", padding } }],
      },
    },
  });
  const headerPadding = (data: Record<string, unknown>) => {
    const pages = data.pagesData as Record<
      string,
      { content: Array<{ props: Record<string, unknown> }> }
    >;
    return pages.home.content[0].props.padding;
  };
  const THEMES_TO_CHECK = [
    "bloom",
    "rose",
    "flux",
    "satin",
    "vanilla",
  ] as const;

  it.each(THEMES_TO_CHECK)(
    "%s: сидовый {0,0} остаётся {0,0} — read-путь его не переписывает",
    (theme) => {
      const out = migrateRevisionData(revision({ top: 0, bottom: 0 }), theme);
      expect(headerPadding(out)).toEqual({ top: 0, bottom: 0 });
    },
  );

  it.each(THEMES_TO_CHECK)(
    "%s: осознанное значение мерчанта не трогаем",
    (theme) => {
      const out = migrateRevisionData(revision({ top: 8, bottom: 40 }), theme);
      expect(headerPadding(out)).toEqual({ top: 8, bottom: 40 });
    },
  );

  it("идемпотентна: повторный прогон ничего не меняет (bloom, {0,0})", () => {
    const once = migrateRevisionData(revision({ top: 0, bottom: 0 }), "bloom");
    const twice = migrateRevisionData(once, "bloom");
    expect(headerPadding(twice)).toEqual({ top: 0, bottom: 0 });
  });
});
