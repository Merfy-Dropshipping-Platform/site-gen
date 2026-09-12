import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveRoseHeadingSize,
  roseHeadingStyle,
} from "../../../themes/rose/src/lib/heading-size";

describe("Rose heading sizes", () => {
  // Слияние линий 2026-09-09: у выбранной (последней) линии rose Gallery и
  // Collections решают размер заголовка НАПРЯМУЮ — `p.headingSize ?? p.heading?.size`
  // и классы лестницы, без хелпера `resolveRoseHeadingSize`. Поведение то же
  // (top-level приоритетнее legacy), поэтому тест проверяет ПОВЕДЕНИЕ секции,
  // а не конкретный вызов. Сам хелпер продолжает проверяться выше.

  it("uses the nested ContactForm size and emits desktop/mobile variables", () => {
    const size = resolveRoseHeadingSize("medium", "large", "nested");

    expect(size).toBe("large");
    expect(roseHeadingStyle("contacts", size)).toContain(
      "--contacts-heading-size:24px",
    );
    expect(roseHeadingStyle("contacts", size)).toContain(
      "--contacts-heading-size-mobile:17px",
    );
  });

  it("normalizes invalid or missing sizes to medium", () => {
    expect(resolveRoseHeadingSize(undefined, undefined, "nested")).toBe(
      "medium",
    );
    expect(resolveRoseHeadingSize("extra-large", undefined, "top-level")).toBe(
      "medium",
    );
  });

  it("wires the ContactForm heading style to its wrapper", () => {
    const contactsSource = readFileSync(
      join(process.cwd(), "themes/rose/src/components/sections/Contacts.astro"),
      "utf8",
    );

    expect(contactsSource).toContain(
      'const headingSizeStyle = roseHeadingStyle("contacts", headingSize);',
    );
    expect(contactsSource).toMatch(
      /<div[^>]*data-puck-subsection-field="heading"[^>]*style=\{headingSizeStyle\}[^>]*>/s,
    );
  });

  it("prefers the top-level Gallery size and wires its variables to the heading wrapper", () => {
    const size = resolveRoseHeadingSize("small", "medium", "top-level");

    expect(size).toBe("small");
    expect(roseHeadingStyle("gallery", size)).toContain(
      "--gallery-heading-size:17px",
    );
    expect(roseHeadingStyle("gallery", size)).toContain(
      "--gallery-heading-size-mobile:12px",
    );

    const gallerySource = readFileSync(
      join(process.cwd(), "themes/rose/src/components/sections/Gallery.astro"),
      "utf8",
    );

    // top-level `headingSize` читается ПЕРЕД legacy `heading.size`.
    expect(gallerySource).toContain("p.headingSize ?? p.heading?.size");
    // Заголовок остаётся кликабельной подсекцией с обёрткой размеров.
    expect(gallerySource).toContain("headWrapCls");
    expect(gallerySource).toMatch(/data-puck-subsection-field="heading"/s);
  });

  it("prefers the top-level Collections size and wires compiled heading variables to its wrapper", () => {
    const size = resolveRoseHeadingSize("large", "small", "top-level");

    expect(size).toBe("large");
    expect(roseHeadingStyle("collections", size)).toContain(
      "--collections-heading-size:24px",
    );
    expect(roseHeadingStyle("collections", size)).toContain(
      "--collections-heading-size-mobile:17px",
    );

    const collectionsSource = readFileSync(
      join(
        process.cwd(),
        "themes/rose/src/components/sections/Collections.astro",
      ),
      "utf8",
    );

    expect(collectionsSource).toContain("p.headingSize");
    expect(collectionsSource).toContain("headWrapBase");
    expect(collectionsSource).toMatch(/data-puck-subsection-field="heading"/s);
    // В выбранной линии размер заголовка Collections идёт через
    // `--size-section-heading` (её читает #collections-title в <style> секции).
    // Запрет на эту переменную был частью другой реализации и здесь неприменим.
    expect(collectionsSource).toContain("--size-section-heading");
  });
});
