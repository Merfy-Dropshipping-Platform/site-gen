/**
 * Дефолт поля панели обязан быть НЕЗАМЕТЕН витрине.
 *
 * Зачем. `CustomFieldsPanel.updateProp` при ЛЮБОЙ правке мержит defaultProps в
 * props (`{...defaultProps, ...existingProps, [field]: value}`) — значит дефолт
 * не остаётся «подсказкой в сайдбаре», он МАТЕРИАЛИЗУЕТСЯ в данные секции.
 * Если он отличается от фолбэка порта, мерчант правит цвет — и уезжает размер.
 * Это ровно тот класс багов, из-за которого правка появилась (жалоба владельца
 * 2026-09-13: «настройки стоят в нейтральном положении, поэтому ловим баги»).
 *
 * Контракт. Для каждого поля ОФОРМЛЕНИЯ (select / radio / alignment / toggle /
 * slider), у которого есть дефолт, рендер секции с ПОЛНЫМ набором defaultProps
 * обязан совпадать байт-в-байт с рендером тех же props БЕЗ этого поля. Секция
 * рендерится ТЕМ ЖЕ скомпилированным модулем темы, что уходит на витрину и в
 * превью (dist/theme-sections/<тема>), а defaultProps берутся у того же
 * контроллера, который отдаёт конфиг конструктору.
 *
 * Почему снимки секций этого не ловят: они рендерят фиксированный набор пропсов
 * и вообще не знают про defaultProps — «дефолт разошёлся с портом» для них
 * выглядит нормой.
 *
 * Требует сборки: pnpm build, pnpm build:blocks, pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const PANEL = resolve(__dirname, "puck-config-panel.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

/** Поля ОФОРМЛЕНИЯ. Контент (тексты, картинки, пикеры) сюда не входит: у него
 *  дефолта нет по определению, а `colorScheme` наследуется от :root. */
const STYLE_TYPES = new Set(["select", "radio", "alignment", "toggle", "slider"]);

/**
 * Дефолты, которые РАСХОДЯТСЯ с фолбэком порта. Все до единого существовали до
 * правки «дефолты панели» (замер на origin/main 9164e966 дал ровно этот список,
 * имя в имя). Каждая запись — живой баг: мерчант правит соседнее поле, а секция
 * меняет вид. Снимать их — отдельная работа: она МЕНЯЕТ вид только что
 * вставленной секции, и решение принимает владелец.
 *
 * Новая запись здесь НЕ появляется сама: добавили дефолт — либо он совпал с
 * портом, либо тест красный. Именно это и сторожим.
 */
const KNOWN_DIVERGENT: Record<Theme, readonly string[]> = {
  rose: [
    "Header.logoPosition",
    "Header.stickiness",
    "MultiColumns.width",
    "MultiRows.width",
    "PopularProducts.buttonStyle",
    "PopularProducts.cards",
    "PromoBanner.size",
  ],
  flux: [
    "Header.logoPosition",
    "Header.stickiness",
    "Hero.position",
    "MultiColumns.width",
    "PopularProducts.buttonStyle",
    "PopularProducts.cards",
    "Product.layout",
    "Publications.headingSize",
    "PromoBanner.size",
  ],
  vanilla: [
    "Collections.columns",
    "ContactForm.headingSize",
    "Header.stickiness",
    "MultiColumns.width",
    "MultiRows.width",
    "PopularProducts.buttonStyle",
    "PopularProducts.cards",
    "PopularProducts.columns",
    "PopularProducts.headingSize",
  ],
  satin: [
    "Header.logoPosition",
    "Header.stickiness",
    "PopularProducts.cards",
    "PopularProducts.imageView",
    "PopularProducts.quickAddMode",
    "PromoBanner.size",
  ],
  bloom: [
    "Header.logoPosition",
    "Header.stickiness",
    "Hero.overlay",
    "Hero.position",
    "PopularProducts.buttonStyle",
    "PopularProducts.cards",
    "PopularProducts.columns",
    "PopularProducts.quickAddMode",
    "PromoBanner.size",
  ],
};

type PanelField = { type: string | null; hasDefault: boolean; value: unknown };
type Job = { block: string; props: Record<string, unknown> };
type Row = { block: string; html?: string; missing?: boolean; error?: string };

const digest = (s: string | undefined): string =>
  createHash("sha1")
    .update(s ?? "")
    .digest("hex");

function themeBlocks(theme: Theme): string[] | null {
  const mf = resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json");
  if (!existsSync(mf)) return null;
  return Object.keys(JSON.parse(readFileSync(mf, "utf-8")) as Record<string, string>);
}

function readPanel(theme: Theme): Record<string, Record<string, PanelField>> | null {
  try {
    const raw = execFileSync("node", [PANEL, theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw) as Record<string, Record<string, PanelField>>;
  } catch {
    return null;
  }
}

describe.each(THEMES)("дефолт не меняет вид витрины — %s", (theme) => {
  const blocks = themeBlocks(theme);
  const panel = readPanel(theme);
  const built = blocks !== null && panel !== null;

  /** Пары (блок, поле оформления с дефолтом) + пропсы для двух рендеров. */
  const pairs: { block: string; field: string }[] = [];
  const jobs: Job[] = [];
  if (built) {
    for (const [block, fields] of Object.entries(panel)) {
      if (!blocks.includes(block)) continue; // блока нет у темы
      // ПОЛНЫЙ набор defaultProps — ровно то, что updateProp запишет в секцию.
      const full: Record<string, unknown> = { id: `${block}-1` };
      for (const [name, f] of Object.entries(fields)) {
        if (f.value !== null && f.value !== undefined) full[name] = f.value;
      }
      for (const [name, f] of Object.entries(fields)) {
        if (!STYLE_TYPES.has(f.type ?? "")) continue;
        if (!f.hasDefault) continue;
        const without = { ...full };
        delete without[name];
        pairs.push({ block, field: name });
        jobs.push({ block, props: full });
        jobs.push({ block, props: without });
      }
    }
  }

  let rows: Row[] = [];
  beforeAll(() => {
    if (!built || jobs.length === 0) return;
    const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 512 * 1024 * 1024,
    });
    rows = JSON.parse(raw) as Row[];
  }, 300_000);

  it("секции темы собраны и puck-config прочитан", () => {
    expect(built).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("каждый дефолт оформления — no-op для порта", () => {
    if (!built) return;
    const divergent: string[] = [];
    pairs.forEach(({ block, field }, i) => {
      const withDef = rows[i * 2];
      const without = rows[i * 2 + 1];
      if (withDef?.missing || without?.missing) return;
      if (withDef?.error || without?.error) return;
      if (digest(withDef?.html) !== digest(without?.html)) {
        divergent.push(`${block}.${field}`);
      }
    });
    // Дефолт разошёлся с портом: рендер со значением и без него отличается.
    // Правьте ДЕФОЛТ (он обязан повторять фолбэк порта), а не снимок.
    expect(divergent.sort()).toEqual([...KNOWN_DIVERGENT[theme]].sort());
  });
});
