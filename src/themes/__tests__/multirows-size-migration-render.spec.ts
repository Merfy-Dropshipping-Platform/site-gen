/**
 * Перенос снятого значения «Как в секции» не должен менять витрину.
 *
 * Решение владельца 2026-09-13 убрало опцию из панели. Сохранённое у мерчантов
 * `size: 'inherit'` переносится миграцией `materializeMultiRowsItemSize` в
 * конкретный размер. Здесь проверяется САМОЕ важное: ряд после переноса
 * рендерится РОВНО той же разметкой, что и до него, — то есть мерчант не
 * увидит изменений. Рендерим настоящим скомпилированным модулем темы (тем, что
 * уходит на витрину и в превью), по всем пяти темам.
 *
 * Требует собранных секций: pnpm build:theme-sections <тема> для всех пяти.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { migrateRevisionData } from "../../utils/revision-migrations";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Секции с разной «Высотой» + ряд со снятым значением. */
const CASES: { sectionSize?: string }[] = [
  { sectionSize: "small" },
  { sectionSize: "medium" },
  { sectionSize: "large" },
  { sectionSize: undefined },
];

function blockProps(sectionSize: string | undefined, rowSize: string) {
  return {
    id: "MultiRows-1",
    colorScheme: "1",
    padding: { top: 40, bottom: 40 },
    heading: "Заголовок",
    ...(sectionSize ? { size: sectionSize } : {}),
    rows: [
      {
        id: "row-1",
        title: "Ряд",
        description: "Текст",
        image: "",
        size: rowSize,
        headingSize: "small",
        textSize: "small",
        button: { text: "Кнопка", link: "/about" },
      },
    ],
  };
}

/** Размер, в который миграция переносит ряд (через настоящую миграцию). */
function migratedRowSize(sectionSize: string | undefined): string {
  const out = migrateRevisionData({
    pagesData: {
      home: {
        content: [{ type: "MultiRows", props: blockProps(sectionSize, "inherit") }],
      },
    },
  }) as { pagesData: Record<string, any> };
  return out.pagesData.home.content[0].props.rows[0].size;
}

function render(theme: string, jobs: { block: string; props: unknown }[]): string[] {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return (JSON.parse(raw) as { html?: string; error?: string; missing?: boolean }[]).map(
    (r) => (r.missing ? "MISSING" : r.error ? `ERROR:${r.error}` : (r.html ?? "")),
  );
}

describe.each(THEMES)("перенос размера ряда не меняет витрину — %s", (theme) => {
  const built = existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  for (const { sectionSize } of CASES) {
    const title = sectionSize ?? "без значения";
    it(`высота секции «${title}» — разметка до и после переноса совпадает`, () => {
      if (!built) return;
      const moved = migratedRowSize(sectionSize);
      const [before, after] = render(theme, [
        { block: "MultiRows", props: blockProps(sectionSize, "inherit") },
        { block: "MultiRows", props: blockProps(sectionSize, moved) },
      ]);
      expect(before).not.toMatch(/^ERROR:/);
      expect(after).toBe(before);
    });
  }
});
