/**
 * Решение Р8: ядро витрины не знает имени расширения и его предметных слов.
 * Подпись товара, который нельзя купить корзиной, приходит из расширения
 * (`saleNotice` в ответе его функции формы); у ядра — только нейтральный текст.
 *
 * Сторож читает исходники рантайма и блоков оформления, которые показывают эту
 * подпись, и не пускает в них слово «заявка» (и его формы). Слова расширения
 * живут в самом расширении.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  NEUTRAL_NOTICE_ACTION,
  NEUTRAL_NOTICE_TEXT,
} from "../runtime/checkout-request-items";

const ROOT = join(__dirname, "..");
const CORE_SOURCES = [
  "runtime/extension-sale.ts",
  "runtime/checkout-request-items.ts",
  "runtime/nt-cart.ts",
  "blocks/CheckoutSubmit/CheckoutSubmit.astro",
  "blocks/CheckoutOrderSummary/CheckoutOrderSummary.astro",
];

describe("ядро витрины: подпись товара, проданного формой", () => {
  it.each(CORE_SOURCES)("%s без слов предметной области расширения", (file) => {
    expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(/заявк/i);
  });

  it("нейтральный текст — без предметных слов", () => {
    expect(NEUTRAL_NOTICE_TEXT).toBe("Товар «{name}» нельзя купить через корзину.");
    expect(NEUTRAL_NOTICE_ACTION).toBe("Открыть товар");
    expect(`${NEUTRAL_NOTICE_TEXT} ${NEUTRAL_NOTICE_ACTION}`).not.toMatch(/заявк/i);
  });
});
