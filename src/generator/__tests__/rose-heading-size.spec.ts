import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  resolveRoseHeadingSize,
  roseHeadingStyle,
} from "../../../themes/rose/src/lib/heading-size";

describe("Rose heading sizes", () => {
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

    expect(gallerySource).toContain(
      'const headingSize = resolveRoseHeadingSize(p.headingSize, p.heading?.size, "top-level");',
    );
    expect(gallerySource).toContain(
      'const headingSizeStyle = roseHeadingStyle("gallery", headingSize);',
    );
    expect(gallerySource).toMatch(
      /<div[^>]*class=\{headWrapCls\}[^>]*style=\{headingSizeStyle\}[^>]*data-puck-subsection-field="heading"[^>]*>/s,
    );
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

    expect(collectionsSource).toContain(
      'const headingSize = resolveRoseHeadingSize(p.headingSize, p.heading?.size, "top-level");',
    );
    expect(collectionsSource).toContain(
      'const headingSizeStyle = roseHeadingStyle("collections", headingSize);',
    );
    expect(collectionsSource).toMatch(
      /<div[^>]*class=\{headWrapCls\}[^>]*style=\{headingSizeStyle\}[^>]*data-puck-subsection-field="heading"[^>]*>/s,
    );
    expect(collectionsSource).not.toContain("[--size-section-heading:");
    expect(collectionsSource).not.toContain("[--size-section-heading-m:");
  });
});
