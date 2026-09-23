import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LOGO_SIZE_CSS, siteTokensCss } from "../tokens-css";
import { parityOn } from "../parity-switch";

/**
 * Пункт 2 сближения «витрина = конструктор» (владелец 23.09, эталон —
 * конструктор). Агент превью вставляет в конструктор правило размера
 * логотипа-картинки с потолком ширины 160px; у vanilla порт держит
 * `max-w-[89px]` / `max-w-[76px]`, и на витрине логотип при высоте из панели
 * сжимался (замер стенда 5c178ceecc1d: 127×40 в конструкторе, 89 в ширину на
 * витрине). Теперь то же правило идёт в общие токены — и в превью, и на
 * живую сборку — под выключателем PARITY_LOGO.
 */

const agentSrc = readFileSync(
  resolve(__dirname, "..", "..", "services", "preview.service.ts"),
  "utf8",
);

describe("правило логотипа: витрина = конструктор", () => {
  it("текст правила совпадает со строкой агента превью символ в символ", () => {
    // Разойдутся — витрина снова начнёт показывать логотип не так, как
    // конструктор. Агент хранит правило строкой в одинарных кавычках.
    expect(agentSrc).toContain(`'${LOGO_SIZE_CSS}',`);
  });

  it.each(["rose", "bloom", "satin", "flux", "vanilla"])(
    "%s: под выключателем правило стоит в конце токенов, без него — нет",
    (theme) => {
      const off = siteTokensCss({}, {}, theme);
      const on = siteTokensCss({}, {}, theme, { logoRule: true });
      expect(off).not.toContain(LOGO_SIZE_CSS);
      // Без выключателя вывод прежний байт в байт, правило только дописывается.
      expect(on).toBe(`${off}\n${LOGO_SIZE_CSS}\n`);
      // Вне @layer/@media — иначе утилита порта max-w-[89px] перебьёт его на
      // витрине. Скобки токенов до правила сбалансированы → правило дописано
      // на верхнем уровне, ни в какой блок не вложено.
      const opens = (off.match(/\{/g) ?? []).length;
      const closes = (off.match(/\}/g) ?? []).length;
      expect(opens).toBe(closes);
    },
  );

  it("выключатель LOGO независим от TOKENS", () => {
    expect(parityOn("LOGO", "a", { PARITY_TOKENS: "*" })).toBe(false);
    expect(parityOn("LOGO", "a", { PARITY_LOGO: "a" })).toBe(true);
    expect(parityOn("LOGO", "b", { PARITY_LOGO: "a" })).toBe(false);
  });
});

/**
 * Все пять путей токенов обязаны передавать правило под PARITY_LOGO — иначе
 * один путь (как было с токенами до пункта 1) покажет логотип по-своему.
 */
describe("проводка PARITY_LOGO во всех путях токенов", () => {
  const flat = (t: string) => t.replace(/\s+/g, " ");
  const files: Array<[string, string, number]> = [
    [
      "services/preview.service.ts",
      "logoRule: parityOn('LOGO', input.siteId)",
      1,
    ],
    [
      "controllers/preview.controller.ts",
      "logoRule: parityOn('LOGO', siteId)",
      3,
    ],
    [
      "generator/build.service.ts",
      'logoRule: parityOn("LOGO", params.siteId)',
      1,
    ],
  ];
  it.each(files)(
    "%s: вызовов с правилом логотипа — %#",
    (rel, needle, count) => {
      const src = flat(
        readFileSync(resolve(__dirname, "..", "..", rel), "utf8"),
      );
      expect(src.split(needle).length - 1).toBe(count);
    },
  );
});
