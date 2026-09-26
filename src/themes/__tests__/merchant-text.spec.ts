import { hasText, pickText, textOf } from "../../../packages/theme-base/runtime/merchant-text";

describe("merchant-text: стёрто ≠ не задано", () => {
  it("textOf читает строку и конверты", () => {
    expect(textOf("Заголовок")).toBe("Заголовок");
    expect(textOf({ text: "" })).toBe("");
    expect(textOf({ content: "Текст" })).toBe("Текст");
    expect(textOf({ size: "small" })).toBeUndefined();
    expect(textOf(undefined)).toBeUndefined();
  });

  it("pickText: пустая строка — это ввод мерчанта, заглушка только без поля", () => {
    expect(pickText("", "Галерея")).toBe("");
    expect(pickText({ text: "" }, "Галерея")).toBe("");
    expect(pickText(undefined, "Галерея")).toBe("Галерея");
    expect(pickText({ size: "large" }, "Галерея")).toBe("Галерея");
  });

  it("hasText: пробелы — не текст", () => {
    expect(hasText("  ")).toBe(false);
    expect(hasText("")).toBe(false);
    expect(hasText(undefined)).toBe(false);
    expect(hasText("Видео")).toBe(true);
  });
});
