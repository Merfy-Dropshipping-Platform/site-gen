/**
 * Секция «Раздел» (CollapsibleSection): подписи и контролы пункта — одни и те же
 * во всех пяти темах.
 *
 * Тестировщик (пункт 59 репорта) про satin: «придать вид наших инпутов и
 * названия Заголовок и Текст». Замер живого gateway 2026-09-15
 * (`/api/themes/<тема>/puck-config`, поле `CollapsibleSection.sections.arrayFields`):
 *
 *   rose/vanilla/flux/bloom → _contentSection (section-header «Содержание»),
 *                             heading (aiText «Заголовок», fieldType title),
 *                             content (aiText «Текст», fieldType description);
 *   satin                   → heading (text «Вопрос / заголовок»),
 *                             content (textarea «Ответ / содержимое»).
 *
 * Общий блок переехал на aiText + divider «Содержание» ещё 25.06 (Figma
 * 1236-42153, см. комментарий в
 * packages/theme-base/blocks/CollapsibleSection/CollapsibleSection.puckConfig.ts),
 * а форк satin не трогали с 14.06 — расхождение держалось три месяца, потому
 * что панель собирается из puckConfig ТЕМЫ и форк ничем не сверялся.
 *
 * Здесь сверяется не «satin с константой», а пять тем между собой: константа
 * устареет при следующей правке макета, а требование «одинаково везде»
 * переживёт её. Состав полей секции (то, что менять нельзя без разрешения
 * владельца) сторожит отдельный гард — test:panel-canon.
 *
 * Требует сборки: pnpm build && pnpm build:blocks.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
const REFERENCE = "rose" as const; // эталон, слова владельца 2026-09-15

type FieldCanon = {
  type: string | null;
  label: string;
  visibility: string;
  itemFields?: Record<string, FieldCanon>;
};

const dump = (): Record<string, Record<string, { fields: Record<string, FieldCanon> }>> =>
  JSON.parse(
    execFileSync("node", [CANON_DUMP], {
      cwd: resolve(__dirname, "..", "..", ".."),
      encoding: "utf-8",
      maxBuffer: 128 * 1024 * 1024,
    }),
  ).themes;

/** Плоская подпись «имя|тип|подпись» — по ней и сверяем, и печатаем расхождение. */
const shape = (fields: Record<string, FieldCanon> | undefined): string[] =>
  Object.entries(fields ?? {}).map(
    ([name, f]) => `${name}|${f.type ?? "—"}|${f.label}`,
  );

describe("«Раздел» — подписи и контролы пункта одинаковы во всех темах", () => {
  const canon = dump();
  const itemFields = (theme: string) =>
    canon[theme]?.CollapsibleSection?.fields?.sections?.itemFields;

  it("эталон rose несёт divider «Содержание» + Заголовок + Текст", () => {
    expect(shape(itemFields(REFERENCE))).toEqual([
      "_contentSection|section-header|Содержание",
      "heading|aiText|Заголовок",
      "content|aiText|Текст",
    ]);
  });

  it.each(THEMES.filter((t) => t !== REFERENCE))(
    "%s: пункт «Раздела» совпадает с rose",
    (theme) => {
      const mine = shape(itemFields(theme));
      const ref = shape(itemFields(REFERENCE));
      expect(`${theme}: ${mine.join(" / ")}`).toBe(`${theme}: ${ref.join(" / ")}`);
    },
  );
});
