import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Подсказка в поле рассылки («Ваш email») берёт цвет из схемы секции.
 *
 * Тестер 24.09: «цветовая схема не применяется к тексту внутри Рассылки в
 * секции Подвал». Подсказка была вшита литералом (`placeholder:text-[#FFD4E5]`
 * у bloom, `#999999` у rose и flux, `#cccccc` у «Рассылки» flux) и не ехала
 * ни за одной схемой. Теперь — приглушённый цвет схемы (`--color-muted`,
 * считается из «Текста» и «Фона»), прежний литерал — только запасной.
 * Матрица схем подсказок не видит (псевдоэлемент), поэтому сторож — по исходнику.
 */
const SITES = resolve(__dirname, "..", "..", "..");
const FILES = ["bloom", "rose", "flux", "vanilla", "satin"].flatMap((t) =>
  [`themes/${t}/src/components/Footer.astro`, `themes/${t}/src/components/sections/Newsletter.astro`].filter((f) =>
    existsSync(resolve(SITES, f)),
  ),
);

describe("подсказка в поле рассылки следует схеме", () => {
  it("файлы найдены (иначе проверка пустая)", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(FILES)("%s: нет вшитого цвета подсказки", (f) => {
    const src = readFileSync(resolve(SITES, f), "utf-8");
    expect(src).not.toMatch(/placeholder:(?:!)?text-\[#[0-9A-Fa-f]{3,8}\]/);
    expect(src).not.toMatch(/placeholder:(?:!)?text-(?:white|black|gray-\d+|neutral-\d+)\b/);
  });
});
