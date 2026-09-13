/**
 * Промо-баннер: «Регистр текста» в панели не место, а текст остаётся как введён.
 *
 * Владелец (2026-09-13): «В промо-баннере добавил в правом сайдбаре поле про
 * регистр — такого поля отродясь не было». История поля, проверенная по
 * коммитам:
 *   d37adfbe 2026-05-04 — заведено ВИДИМЫМ (radio «Регистр текста»);
 *   2f5c5212 2026-05-16 — убрано с экрана (`type: 'hidden'`), и так стояло
 *                         почти четыре месяца;
 *   63a17c25 2026-09-09 — НАМИ возвращено в панель селектом. Это и есть
 *                         отклонение, которое снимает этот тест.
 *
 * Почему `type: 'hidden'`, а не `hiddenInMainPanel`. Проверено по исходнику
 * конструктора: `hiddenInMainPanel` лишь убирает контрол из ОСНОВНОЙ панели, а
 * дерево слева продолжает открывать его подпанелью — это «перенести», а не
 * «убрать». `type: 'hidden'` возвращает null И в FieldRenderer.tsx, И в
 * CustomFieldsPanel.tsx: контрола нет нигде. Проп при этом остаётся в схеме и
 * в дефолтах темы — ревизия мерчанта, где регистр уже выбран, разбирается как
 * прежде.
 *
 * Второе требование того же владельца — текст выводится как введён. Оно живёт
 * в портах и в theme.json (`blockDefaults.PromoBanner.textTransform: 'none'`);
 * тест меряет его рендером, чтобы снятие контрола не утащило поведение за
 * собой.
 *
 * Требует: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Строчный маркер — ровно так текст вводит мерчант. */
const MARKER = "мсн текст баннера";

function panel(theme: string) {
  const raw = execFileSync("node", [CANON_DUMP, "--theme", theme], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw).themes[theme].PromoBanner.fields as Record<
    string,
    { type: string; label: string; visibility: string }
  >;
}

function render(theme: string, props: Record<string, unknown>) {
  const raw = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "PromoBanner", props }])],
    { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  const entry = JSON.parse(raw)[0] as { html?: string; error?: string };
  return entry.error ? `ОШИБКА: ${entry.error}` : (entry.html ?? "");
}

describe.each(THEMES)("промо-баннер (%s)", (theme) => {
  const blocksBuilt = existsSync(
    resolve(SITES_ROOT, "dist", "astro-blocks", "manifest.json"),
  );
  const sectionsBuilt = existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

  it("блоки и секции собраны", () => {
    expect(blocksBuilt).toBe(true);
    expect(sectionsBuilt).toBe(true);
  });

  it("контрола «Регистр текста» в панели нет", () => {
    if (!blocksBuilt) return;
    const fields = panel(theme);
    const labels = Object.values(fields).map((f) => f.label);
    expect(labels).not.toContain("Регистр текста");
    // Проп никуда не делся — иначе ревизия, где мерчант выбрал регистр,
    // разбиралась бы уже без него.
    expect(fields.textTransform).toBeDefined();
    expect(fields.textTransform.visibility).toBe("off");
  });

  it("панель промо-баннера — ровно пять параметров канона", () => {
    if (!blocksBuilt) return;
    const fields = panel(theme);
    const onScreen = Object.entries(fields)
      .filter(([, f]) => f.visibility !== "off")
      .map(([name]) => name)
      .sort();
    // Канон (шапка PromoBanner.puckConfig.ts): text, link, size — подпанель
    // «Объявление»; colorScheme и padding — основная панель. Тумблера «Показ»
    // здесь нет: секцию скрывает «глаз» строки в дереве слева.
    expect(onScreen).toEqual([
      "colorScheme",
      "link",
      "padding",
      "size",
      "text",
    ]);
  });

  it("без выбора мерчанта текст выводится как введён, без капса", () => {
    if (!sectionsBuilt) return;
    const html = render(theme, {
      id: "PB",
      text: MARKER,
      size: "large",
      colorScheme: "1",
    });
    expect(html).not.toMatch(/^ОШИБКА/);
    expect(html).toContain(MARKER);
    expect(html).not.toContain("uppercase");
  });

  it("ревизия с уже выбранным регистром разбирается и рисуется как прежде", () => {
    if (!sectionsBuilt) return;
    const asTyped = render(theme, {
      id: "PB",
      text: MARKER,
      size: "large",
      colorScheme: "1",
      textTransform: "none",
    });
    expect(asTyped).toContain(MARKER);
    expect(asTyped).not.toContain("uppercase");

    const upper = render(theme, {
      id: "PB",
      text: MARKER,
      size: "large",
      colorScheme: "1",
      textTransform: "uppercase",
    });
    expect(upper).not.toMatch(/^ОШИБКА/);
    expect(upper).toContain(MARKER);
    // Механизм жив: снятие контрола не выкидывает уже сохранённый выбор.
    expect(upper).toContain("uppercase");
  });
});
