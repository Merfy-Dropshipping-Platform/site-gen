import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Баг владельца 20.09 со скриншотом карточки темы: «Добавлено 15 апреля 2026»
 * — это дата появления темы В СИСТЕМЕ, одна и та же у всех магазинов, которые
 * выбрали Bloom. Нужна дата, когда тему выбрал ЭТОТ мерчант, а её нигде не
 * хранили.
 *
 * Завели колонку `theme_applied_at` и пишем её при фактической смене темы.
 *
 * Два условия, которые легко потерять и оба важны:
 *  1. писать ТОЛЬКО когда тема реально изменилась — иначе обычное сохранение
 *     настроек двигало бы дату, и она стала бы «последним сохранением»;
 *  2. у магазинов, созданных раньше, колонка пуста: событий смены темы мы не
 *     писали, восстановить нечего. Интерфейс показывает запасное — дату
 *     создания магазина.
 */

const ROOT = resolve(__dirname, "..", "..");
const SCHEMA = readFileSync(resolve(ROOT, "src/db/schema.ts"), "utf-8");
const SERVICE = readFileSync(resolve(ROOT, "src/sites.service.ts"), "utf-8");
const MIGRATION = readFileSync(
  resolve(ROOT, "drizzle/0016_site_theme_applied_at.sql"),
  "utf-8",
);

describe("дата выбора темы магазином", () => {
  it("колонка объявлена в схеме", () => {
    expect(SCHEMA).toMatch(/themeAppliedAt: timestamp\("theme_applied_at"\)/);
  });

  it("миграция добавляет колонку идемпотентно", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "theme_applied_at" timestamp/);
  });

  it("колонка НЕ обязательная — у старых магазинов её нет", () => {
    const line = SCHEMA.split("\n").find((l) => l.includes('timestamp("theme_applied_at")'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/notNull/);
  });

  it("дата пишется при смене темы", () => {
    expect(SERVICE).toMatch(/updates\.themeAppliedAt = nextThemeId \? new Date\(\) : null;/);
  });

  it("повторное сохранение с той же темой дату НЕ двигает", () => {
    const block = SERVICE.slice(SERVICE.indexOf("Дата выбора темы мерчантом"));
    expect(block.slice(0, 600)).toMatch(
      /nextThemeId !== \(existingSite\?\.themeId \?\? null\)/,
    );
  });

  it("снятие темы очищает дату, а не оставляет старую", () => {
    expect(SERVICE).toMatch(/nextThemeId \? new Date\(\) : null/);
  });
});

describe("саботаж: гард ловит потерю условий", () => {
  it("запись без сравнения со старой темой — красный", () => {
    const naive = "updates.themeAppliedAt = new Date();";
    expect(/nextThemeId !== \(existingSite\?\.themeId \?\? null\)/.test(naive)).toBe(false);
  });

  it("обязательная колонка сломала бы старые магазины — красный", () => {
    const bad = 'themeAppliedAt: timestamp("theme_applied_at").notNull(),';
    expect(/notNull/.test(bad)).toBe(true);
  });
});
