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
      join(
        process.cwd(),
        "themes/rose/src/components/sections/Contacts.astro",
      ),
      "utf8",
    );

    expect(contactsSource).toContain(
      'const headingSizeStyle = roseHeadingStyle("contacts", headingSize);',
    );
    expect(contactsSource).toMatch(
      /<div[^>]*data-puck-subsection-field="heading"[^>]*style=\{headingSizeStyle\}[^>]*>/s,
    );
  });
});
