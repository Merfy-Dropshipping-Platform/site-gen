import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Кнопки вариантов одной группы — одной ширины.
 *
 * Владелец 21.09 со снимком PDP: «варианты кнопки одинаковыми должны быть при
 * одних и тех же показателях, S M L к примеру». Замер его ряда в Chrome:
 * XS 57, S 47, M 49, L 45, XL 56, XXL 66 — каждый чип по своему слову.
 *
 * Канон верстальщиков (`NtVariantTextRow.astro`, Figma 494:10735 «Кнопка --
 * Нет») задаёт `h-10 px-3` — ширину ПО СОДЕРЖИМОМУ. Равные чипы там есть
 * только у формы «Круг/Квадрат» (`h-12 min-w-12`). То есть «как в каноне» = то,
 * на что он жалуется; на это он и ответил «или сделай нормально».
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RUNTIME = resolve(SITES_ROOT, "packages/theme-base/runtime/variant-chip-equalize.ts");
const PRODUCT = resolve(SITES_ROOT, "packages/theme-base/blocks/Product/Product.astro");

// Числа замерены в браузере на шрифте системы (см. комментарий в рантайме).
const ЗАМЕР = {
  "theme-base, размеры": { widest: 66, height: 48, ждём: 66 },
  "theme-base, цвета": { widest: 154, height: 48, ждём: 96 },
  "порты тем, размеры": { widest: 52, height: 40, ждём: 52 },
  "порты тем, цвета": { widest: 129, height: 40, ждём: 80 },
};

describe("ширина чипа варианта", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { chipTargetWidth, CAP_RATIO } = require("../../../packages/theme-base/runtime/variant-chip-equalize") as {
    chipTargetWidth: (w: number, h: number) => number;
    CAP_RATIO: number;
  };

  it.each(Object.entries(ЗАМЕР))("%s", (_имя, { widest, height, ждём }) => {
    expect(chipTargetWidth(widest, height)).toBe(ждём);
  });

  it("короткие подписи выравниваются по самой широкой, а не по потолку", () => {
    // Ровно жалоба: XS…XXL должны стать ОДНОЙ ширины, и именно 66, а не 96.
    expect(chipTargetWidth(66, 48)).toBe(66);
    expect(chipTargetWidth(45, 48)).toBe(45);
  });

  it("длинное слово не растягивает всю группу", () => {
    // Без потолка «Светло-голубой» (154) утянул бы за собой три соседних чипа,
    // ряд вырос бы с 419 до 640px и переносился на две строки.
    expect(chipTargetWidth(154, 48)).toBeLessThan(154);
    expect(chipTargetWidth(154, 48)).toBe(48 * CAP_RATIO);
  });

  it("потолок привязан к высоте чипа, а не к длине подписи", () => {
    // Эвристика «подпись до N символов» ломается на «42/44/46» и «One size».
    const src = readFileSync(RUNTIME, "utf-8");
    expect(src).toMatch(/height \* CAP_RATIO/);
    expect(src).not.toMatch(/\.length\s*<=\s*\d/);
  });
});

describe("механизм покрывает ВСЕ пути рендера", () => {
  const src = readFileSync(RUNTIME, "utf-8");

  it("ловит перерисовку, а не только серверный рендер", () => {
    // Ряд рисуют шесть путей: ProductVariants.astro + пять перерисовок
    // гидрации тем. Правка в каждом — тот самый «фича на одном пути из трёх».
    expect(src).toMatch(/new MutationObserver/);
    expect(src).toMatch(/childList: true, subtree: true/);
  });

  it("наблюдает только за узлами — иначе своя же правка зациклит", () => {
    // min-width пишется в inline-стиль; подписка на attributes дала бы
    // бесконечный цикл.
    expect(src).not.toMatch(/attributes:\s*true/);
  });

  it("знает обе разметки групп", () => {
    expect(src).toContain("[data-variant-chip][data-variant-key]");
    expect(src).toContain('[role="radiogroup"]');
  });

  it("сбрасывает прошлый минимум перед замером", () => {
    // Иначе повторный проход мерил бы уже выровненные чипы и ряд только рос бы.
    expect(src).toMatch(/removeProperty\('min-width'\)/);
  });

  it("подключён и к flux — он рисует «Товар» своей секцией", () => {
    // flux резолвит Product в `FeaturedProduct.astro`, а не в блок theme-base:
    // замер рендера 21.09 показал, что скрипт туда не попадал вовсе — четыре
    // темы из пяти. Ровно «фича на одном пути из трёх», второй раз за задачу.
    const flux = readFileSync(
      resolve(SITES_ROOT, "themes/flux/src/components/sections/FeaturedProduct.astro"),
      "utf-8",
    );
    expect(flux).toMatch(/VARIANT_CHIP_EQUALIZE_SOURCE/);
    expect(flux).toMatch(/set:html=\{VARIANT_CHIP_EQUALIZE_SOURCE\}/);
  });

  it("подключён к блоку «Товар» СТРОКОЙ, а не модулем", () => {
    // Первый заход подключил рантайм как `<script>import …</script>`. На
    // собранной витрине это дало src="/app/packages/…/Product.astro?astro&
    // type=script" → 404 (замер на живом стенде 21.09): код не грузился вовсе,
    // а гард при этом был зелёный — он сторожил строку импорта.
    const product = readFileSync(PRODUCT, "utf-8");
    expect(product).toMatch(/set:html=\{VARIANT_CHIP_EQUALIZE_SOURCE\}/);
    expect(product).toMatch(/is:inline/);
    expect(product).not.toMatch(/<script>\s*\n?\s*import '\.\.\/\.\.\/runtime\/variant-chip-equalize'/);
  });

  it("исходник отдаётся строкой и сам себя запускает", () => {
    expect(src).toMatch(/export const VARIANT_CHIP_EQUALIZE_SOURCE = `/);
    expect(src).toMatch(/document\.addEventListener\('DOMContentLoaded', start\)/);
  });
});
