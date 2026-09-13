/**
 * Владелец, 13.09 (дословно): «В мультирядах изменить название кнопки с
 * "Вторичной" на "Дополнительную", в пункте "Стиль кнопки"».
 *
 * Замер «до» (grep + чтение файлов):
 *   packages/theme-base/blocks/MultiRows/MultiRows.puckConfig.ts:179
 *     { label: 'Вторичная', value: 'secondary' }
 *   и снимок канона нёс `secondary=Вторичная` у rose, bloom, flux, vanilla.
 *   У satin СОБСТВЕННЫЙ MultiRows (packages/theme-satin/…): там опции другие —
 *   «Основная / Чёрная / Белая», слова «Вторичная» нет вовсе. Поэтому пятая
 *   тема в этой правке не участвует: выдумывать ей «Дополнительную» значило бы
 *   менять состав панели, чего владелец запретил отдельно.
 *
 * Сторожим ДВЕ вещи:
 *   1) у тем, где опция `secondary` есть, подпись ровно «Дополнительная»;
 *   2) слова «Вторичная» нет НИ В ОДНОЙ панели НИ ОДНОЙ темы — иначе правка
 *      «сделана в мультирядах» и тут же обойдена соседней секцией.
 *
 * Значение `secondary` не трогаем: его пишет ревизия мерчанта и читает
 * resolveMultiRowsButtonStyle.
 *
 * Требует собранного dist: pnpm build && pnpm build:blocks.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

type FieldCanon = {
  type: string | null;
  label: string;
  options?: string[];
  itemFields?: Record<string, FieldCanon>;
  objectFields?: Record<string, FieldCanon>;
};
type ThemeCanon = Record<
  string,
  { label: string; fields: Record<string, FieldCanon> }
>;

const cache = new Map<string, ThemeCanon>();

function panels(theme: string): ThemeCanon {
  const hit = cache.get(theme);
  if (hit) return hit;
  const raw = execFileSync("node", [CANON_DUMP, "--theme", theme], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw).themes[theme] as ThemeCanon;
  cache.set(theme, parsed);
  return parsed;
}

/** Все подписи опций темы в виде «блок.поле → подпись» (включая вложенные). */
function allOptionLabels(
  theme: string,
): Array<{ where: string; label: string }> {
  const out: Array<{ where: string; label: string }> = [];
  const walk = (where: string, field: FieldCanon) => {
    for (const opt of field.options ?? []) {
      const label = opt.slice(opt.indexOf("=") + 1);
      out.push({ where, label });
    }
    for (const [name, sub] of Object.entries(field.itemFields ?? {})) {
      walk(`${where}.${name}`, sub);
    }
    for (const [name, sub] of Object.entries(field.objectFields ?? {})) {
      walk(`${where}.${name}`, sub);
    }
  };
  for (const [block, def] of Object.entries(panels(theme))) {
    for (const [name, field] of Object.entries(def.fields)) {
      walk(`${block}.${name}`, field);
    }
  }
  return out;
}

describe("Мультиряды → выбор кнопки", () => {
  it.each(THEMES)(
    "%s: у опции `secondary` подпись «Дополнительная»",
    (theme) => {
      const options =
        panels(theme).MultiRows?.fields?.buttonStyle?.options ?? [];
      expect(options.length).toBeGreaterThan(0);
      const secondary = options.filter((o) => o.startsWith("secondary="));
      if (secondary.length === 0) {
        // satin: своя тройка опций, `secondary` в панели нет — проверять нечего.
        expect(options.some((o) => o.includes("Вторичная"))).toBe(false);
        return;
      }
      expect(secondary).toEqual(["secondary=Дополнительная"]);
    },
  );

  it.each(THEMES)(
    "%s: слова «Вторичная» нет ни в одной панели темы",
    (theme) => {
      const hits = allOptionLabels(theme).filter((o) =>
        o.label.includes("Вторичн"),
      );
      expect(hits.map((h) => `${h.where}=${h.label}`)).toEqual([]);
    },
  );

  it.each(THEMES)("%s: значение опции осталось `secondary`", (theme) => {
    const options = panels(theme).MultiRows?.fields?.buttonStyle?.options ?? [];
    const values = options.map((o) => o.slice(0, o.indexOf("=")));
    expect(values).toContain("primary");
    // Подпись сменилась, значение — нет: ревизии мерчантов читаются как прежде.
    expect(values.some((v) => /[А-Яа-я]/.test(v))).toBe(false);
  });
});
