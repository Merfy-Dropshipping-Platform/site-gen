import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  normalizeRoseMultiRowsButtonStyle,
  normalizeRoseSlidePosition,
  roseFooterHeadingStyle,
  roseFooterTextClass,
  rosePromoBannerSize,
} from "../../../themes/rose/src/lib/section-settings";

describe("Rose section setting normalizers", () => {
  it("centers legacy or invalid slideshow positions", () => {
    expect(normalizeRoseSlidePosition(undefined)).toBe("center");
    expect(normalizeRoseSlidePosition("not-a-position")).toBe("center");
    expect(normalizeRoseSlidePosition("left")).toBe("center-left");
    expect(normalizeRoseSlidePosition("right")).toBe("center-right");
    expect(normalizeRoseSlidePosition("bottom-right")).toBe("bottom-right");
  });

  it("maps footer heading sizes and preserves the current missing default", () => {
    expect(roseFooterHeadingStyle("large")).toBe(
      "--size-section-heading:24px;--size-section-heading-m:17px;",
    );
  });

  it("maps footer text sizes and preserves the current missing default", () => {
    expect(roseFooterTextClass("small")).toBe("!text-[14px]");
    expect(roseFooterTextClass("medium")).toBe("!text-[15px]");
    expect(roseFooterTextClass("large")).toBe("!text-[16px]");
    expect(roseFooterTextClass(undefined)).toBe("!text-[16px]");
  });

  it("normalizes the legacy secondary MultiRows button to white", () => {
    expect(normalizeRoseMultiRowsButtonStyle("secondary")).toBe("white");
    expect(normalizeRoseMultiRowsButtonStyle("white")).toBe("white");
    expect(normalizeRoseMultiRowsButtonStyle("black")).toBe("black");
    expect(normalizeRoseMultiRowsButtonStyle(undefined)).toBe("primary");
  });

  it("maps the thin promo banner without falling back to large", () => {
    expect(rosePromoBannerSize("thin")).toEqual({
      minHeightClass: "min-h-8",
      textClass: "text-[12px]",
    });
    expect(rosePromoBannerSize(undefined)).toEqual({
      minHeightClass: "min-h-12",
      textClass: "text-[16px]",
    });
  });
});

describe("Rose section setting renderer wiring", () => {
  it("normalizes Slideshow position before selecting placement classes", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "themes/rose/src/components/sections/Slideshow.astro",
      ),
      "utf8",
    );

    expect(source).toContain("normalizeRoseSlidePosition(s.position)");
    expect(source).not.toContain('s.position ? s.position : ""');
  });

  it("applies Footer heading and text size classes from props", () => {
    const source = readFileSync(
      join(process.cwd(), "themes/rose/src/components/Footer.astro"),
      "utf8",
    );

    expect(source).toContain("roseFooterHeadingStyle(p.heading?.size)");
    expect(source).toContain("roseFooterTextClass(p.text?.size)");
    expect(source).toMatch(/<h2[\s\S]*style=\{newsletterHeadingSizeStyle\}/);
    expect(source).toMatch(
      /<p[\s\S]*class:list=\{\[[\s\S]*newsletterTextSizeCls[\s\S]*\]\}/,
    );
    expect(source).not.toContain("!text-[clamp(14px,2.2vw,20px)]");
  });

  it("keeps canonical MultiRows options while rendering legacy secondary", () => {
    const configSource = readFileSync(
      join(
        process.cwd(),
        "packages/theme-base/blocks/MultiRows/MultiRows.puckConfig.ts",
      ),
      "utf8",
    );
    expect(configSource).toContain(
      "z.enum(['primary', 'black', 'white', 'secondary'])",
    );
    expect(configSource).not.toContain(
      "{ label: 'Вторичная', value: 'secondary' }",
    );

    const source = readFileSync(
      join(
        process.cwd(),
        "themes/rose/src/components/sections/MultiRows.astro",
      ),
      "utf8",
    );
    expect(source).toContain(
      "normalizeRoseMultiRowsButtonStyle(p.buttonStyle)",
    );
  });

  it("uses the complete PromoBanner size mapping", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "themes/rose/src/components/sections/PromoBanner.astro",
      ),
      "utf8",
    );

    expect(source).toContain("rosePromoBannerSize(p.size)");
    expect(source).not.toContain("const SIZE_MAP");
  });
});
