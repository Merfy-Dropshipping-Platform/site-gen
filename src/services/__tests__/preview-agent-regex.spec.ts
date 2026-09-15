import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Регулярки внутри инлайн-агента превью обязаны доезжать до браузера целыми.
 *
 * Агент вставляется в страницу как ШАБЛОННАЯ строка. Одиночный `\d` в ней
 * схлопывается в `d` ещё на сервере, и `/\bcolor-scheme-\d+\b/` приезжает как
 * `/color-scheme-d+/` — старый класс схемы не снимается, классы наслаиваются,
 * разметка корёжится при живой правке корзины и шапки. Поймано 15.09: таких
 * мест было 22. В шаблоне каждый слэш обязан быть удвоен.
 */
const SRC = readFileSync(
  join(__dirname, "..", "preview.service.ts"),
  "utf8",
);

function agentBody(): string {
  const start = SRC.indexOf("const PREVIEW_NAV_AGENT_INLINE = `");
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf("\n`;", start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe("инлайн-агент превью", () => {
  it("не содержит одиночных escape-последовательностей", () => {
    const bad = agentBody().match(/(?<!\\)\\[dswbDSWB]/g) ?? [];
    expect({ найдено: bad.length, примеры: bad.slice(0, 5) }).toEqual({
      найдено: 0,
      примеры: [],
    });
  });

  it("класс схемы снимается настоящей регуляркой, а не её огрызком", () => {
    const body = agentBody();
    // в исходнике — удвоенный слэш; значит в браузер уедет одинарный
    expect(body).toContain("color-scheme-");
    expect(body).not.toMatch(/\/color-scheme-d\+/);
  });

  it("контроль: огрызок регулярки действительно не находит класс", () => {
    const broken = /color-scheme-d+/g;
    expect("color-scheme-2 x".replace(broken, "")).toBe("color-scheme-2 x");
    const whole = /\bcolor-scheme-\d+\b/g;
    expect("color-scheme-2 x".replace(whole, "").trim()).toBe("x");
  });
});
