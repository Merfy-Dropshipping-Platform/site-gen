/**
 * Тесты чистых функций блока расширения внутри текста политики.
 *
 * Формат блока:
 *   <!-- ext:<extensionId> -->
 *   <текст>
 *   <!-- /ext:<extensionId> -->
 *
 * Ядро sites не знает о конкретных расширениях — только про этот формат
 * маркеров. Функции без Nest, без побочных эффектов.
 */
import { hasExtensionBlock, setExtensionBlock } from "../extension-block";

describe("setExtensionBlock", () => {
  it("вставляет блок в пустой контент", () => {
    const result = setExtensionBlock(
      "",
      "reviews",
      "Цель обработки: демонстрация",
    );
    expect(result).toBe(
      "<!-- ext:reviews -->\nЦель обработки: демонстрация\n<!-- /ext:reviews -->",
    );
  });

  it("вставляет блок в конец непустого контента через пустую строку", () => {
    const result = setExtensionBlock(
      "Действующий текст политики.",
      "reviews",
      "Цель обработки: демонстрация",
    );
    expect(result).toBe(
      "Действующий текст политики.\n\n" +
        "<!-- ext:reviews -->\nЦель обработки: демонстрация\n<!-- /ext:reviews -->",
    );
  });

  it("заменяет существующий блок с тем же id на месте, не трогая остальной текст", () => {
    const before =
      "Шапка.\n\n<!-- ext:reviews -->\nСтарый текст\n<!-- /ext:reviews -->\n\nПодвал.";
    const withBlock = setExtensionBlock(before, "reviews", "Новый текст");
    expect(withBlock).toBe(
      "Шапка.\n\n<!-- ext:reviews -->\nНовый текст\n<!-- /ext:reviews -->\n\nПодвал.",
    );
  });

  it("замена не меняет положение блока и текст других блоков", () => {
    let content = setExtensionBlock("Начало.", "reviews", "Текст A");
    content = setExtensionBlock(content, "referral", "Текст B");
    // reviews идёт первым, referral — вторым; заменяем reviews.
    content = setExtensionBlock(content, "reviews", "Текст A2");

    expect(content).toBe(
      "Начало.\n\n" +
        "<!-- ext:reviews -->\nТекст A2\n<!-- /ext:reviews -->\n\n" +
        "<!-- ext:referral -->\nТекст B\n<!-- /ext:referral -->",
    );
  });

  it("null убирает блок вместе с лишними пустыми строками (блок был единственным контентом)", () => {
    const withBlock = setExtensionBlock("", "reviews", "Текст");
    const result = setExtensionBlock(withBlock, "reviews", null);
    expect(result).toBe("");
  });

  it("null убирает блок в середине текста, не оставляя лишних пустых строк", () => {
    const withBlock = setExtensionBlock(
      "Шапка.\n\nПодвал.",
      "reviews",
      "Текст",
    );
    // withBlock: 'Шапка.\n\n<!-- ext:reviews -->\nТекст\n<!-- /ext:reviews -->\n\nПодвал.'
    const result = setExtensionBlock(withBlock, "reviews", null);
    expect(result).toBe("Шапка.\n\nПодвал.");
  });

  it("null для отсутствующего блока не меняет контент", () => {
    const content = "Обычный текст политики без блоков.";
    expect(setExtensionBlock(content, "reviews", null)).toBe(content);
  });

  it("два разных id не мешают друг другу: вставка и удаление одного не трогает другой", () => {
    let content = setExtensionBlock("", "reviews", "Текст A");
    content = setExtensionBlock(content, "referral", "Текст B");
    content = setExtensionBlock(content, "reviews", null);

    expect(content).toBe(
      "<!-- ext:referral -->\nТекст B\n<!-- /ext:referral -->",
    );
    expect(hasExtensionBlock(content, "reviews")).toBe(false);
    expect(hasExtensionBlock(content, "referral")).toBe(true);
  });

  it("идемпотентно: повторная вставка того же текста не меняет результат", () => {
    const once = setExtensionBlock("Базовый текст.", "reviews", "Текст A");
    const twice = setExtensionBlock(once, "reviews", "Текст A");
    expect(twice).toBe(once);
  });

  it("идемпотентно: повторное удаление не меняет результат", () => {
    const withBlock = setExtensionBlock("Базовый текст.", "reviews", "Текст A");
    const once = setExtensionBlock(withBlock, "reviews", null);
    const twice = setExtensionBlock(once, "reviews", null);
    expect(twice).toBe(once);
  });

  it("невалидный id бросает ошибку и не трогает контент", () => {
    expect(() => setExtensionBlock("текст", "BAD-ID", "x")).toThrow(
      "invalid extension id",
    );
    expect(() => setExtensionBlock("текст", "1abc", "x")).toThrow(
      "invalid extension id",
    );
    expect(() => setExtensionBlock("текст", "ab", "x")).toThrow(
      "invalid extension id",
    );
    expect(() => setExtensionBlock("текст", "a".repeat(33), "x")).toThrow(
      "invalid extension id",
    );
    expect(() => setExtensionBlock("текст", "has space", "x")).toThrow(
      "invalid extension id",
    );
  });

  it("валидные границы id (3 и 32 символа) проходят", () => {
    expect(() => setExtensionBlock("", "abc", "x")).not.toThrow();
    expect(() => setExtensionBlock("", "a".repeat(32), "x")).not.toThrow();
  });
});

describe("hasExtensionBlock", () => {
  it("true, когда блок есть; false — когда нет", () => {
    const content = setExtensionBlock("", "reviews", "Текст");
    expect(hasExtensionBlock(content, "reviews")).toBe(true);
    expect(hasExtensionBlock(content, "referral")).toBe(false);
    expect(hasExtensionBlock("", "reviews")).toBe(false);
  });

  it("невалидный id бросает ошибку", () => {
    expect(() => hasExtensionBlock("текст", "BAD")).toThrow(
      "invalid extension id",
    );
  });
});
