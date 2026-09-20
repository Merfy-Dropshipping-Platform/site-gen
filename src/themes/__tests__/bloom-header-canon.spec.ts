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
const SEEDS_DIR = resolve(__dirname, "..", "..", "..", "packages", "theme-bloom", "pages");

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
    [RENDERER, "bloom", JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`bloom/${logoPosition}: ${res.error}`);
  return res.html ?? "";
}

/** Иконки десктопных рядов: всё, что идёт после мобильной строки `md:hidden`. */
function desktopPart(html: string): string {
  const cut = html.indexOf('max-w-[1920px]');
  return cut > 0 ? html.slice(cut) : html;
}

const LAYOUTS = ["top-center", "top-left", "center-left", "center-absolute"];

describe("шапка bloom: размер иконок по эталону верстальщиков", () => {
  it.each(LAYOUTS)("%s: десктопные иконки — size-5, ни одной size-6", (layout) => {
    const desktop = desktopPart(renderHeader(layout));
    // хотя бы одна иконка отрисована
    expect(desktop).toMatch(/size-5/);
    // размер верстальщиков 24px (size-6) вернуться не должен
    expect(desktop).not.toMatch(/size-6/);
  });
});

describe("шапка bloom: сид не обнуляет отступы", () => {
  const seeds = readdirSync(SEEDS_DIR).filter((f) => f.endsWith(".json"));

  it("сидов страниц найдено", () => {
    expect(seeds.length).toBeGreaterThan(5);
  });

  it.each(seeds)("%s: у шапки канонные отступы, а не нули", (file) => {
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
      const pad = props.padding as { top?: unknown; bottom?: unknown } | undefined;
      if (!pad) continue;
      expect({ file, ...pad }).not.toEqual({ file, top: 0, bottom: 0 });
    }
  });
});

describe("миграция: сидовый ноль у существующих магазинов становится каноном", () => {
  const revision = (padding: unknown) => ({
    pagesData: {
      home: {
        content: [{ type: "Header", props: { id: "Header-1", padding } }],
      },
    },
  });
  const headerPadding = (data: Record<string, unknown>) => {
    const pages = data.pagesData as Record<string, { content: Array<{ props: Record<string, unknown> }> }>;
    return pages.home.content[0].props.padding;
  };

  it("bloom: {0,0} → {16,16}", () => {
    const out = migrateRevisionData(revision({ top: 0, bottom: 0 }), "bloom");
    expect(headerPadding(out)).toEqual({ top: 16, bottom: 16 });
  });

  it("bloom: осознанное значение мерчанта не трогаем", () => {
    const out = migrateRevisionData(revision({ top: 8, bottom: 40 }), "bloom");
    expect(headerPadding(out)).toEqual({ top: 8, bottom: 40 });
  });

  it("другая тема: ноль оставляем как есть", () => {
    const out = migrateRevisionData(revision({ top: 0, bottom: 0 }), "rose");
    expect(headerPadding(out)).toEqual({ top: 0, bottom: 0 });
  });

  it("идемпотентна: повторный прогон ничего не меняет", () => {
    const once = migrateRevisionData(revision({ top: 0, bottom: 0 }), "bloom");
    const twice = migrateRevisionData(once, "bloom");
    expect(headerPadding(twice)).toEqual({ top: 16, bottom: 16 });
  });
});
