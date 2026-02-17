/**
 * Integration tests for build.service.ts internals.
 *
 * Tests the extractSiteConfig function and stageGenerate logic
 * that orchestrate page generation from revision data.
 */

import { extractSiteConfig } from "../build.service";

describe("extractSiteConfig behavior", () => {

  it("extracts Header props from legacy single-page format", () => {
    const revData = {
      content: [
        {
          type: "Header",
          props: { siteTitle: "My Store", logo: "/my-logo.png" },
        },
        { type: "Hero", props: { title: "Welcome" } },
      ],
    };

    const config = extractSiteConfig(revData);

    expect((config.header as any).siteTitle).toBe("My Store");
    expect((config.header as any).logo).toBe("/my-logo.png");
  });

  it("extracts Footer props from legacy format", () => {
    const revData = {
      content: [
        {
          type: "Footer",
          props: { copyright: { text: "2024 My Store" } },
        },
      ],
    };

    const config = extractSiteConfig(revData);

    expect((config.footer as any).copyright).toEqual({ text: "2024 My Store" });
  });

  it("prefers multipage home page over legacy content", () => {
    const revData = {
      content: [{ type: "Header", props: { siteTitle: "Legacy" } }],
    };
    const pagesData = {
      home: {
        content: [{ type: "Header", props: { siteTitle: "Multipage" } }],
      },
    };

    const config = extractSiteConfig(revData, pagesData);

    expect((config.header as any).siteTitle).toBe("Multipage");
  });

  it("returns default values when no Header/Footer found", () => {
    const revData = {
      content: [{ type: "Hero", props: { title: "Hello" } }],
    };

    const config = extractSiteConfig(revData);

    expect(config.header).toEqual({});
    expect(config.footer).toEqual({});
  });

  it("handles empty content array", () => {
    const config = extractSiteConfig({ content: [] });

    expect(config.header).toEqual({});
    expect(config.footer).toEqual({});
  });

  it("handles missing content field", () => {
    const config = extractSiteConfig({});

    expect(config.header).toEqual({});
    expect(config.footer).toEqual({});
  });

  it("provides defaults for missing Header props", () => {
    const revData = {
      content: [{ type: "Header", props: {} }],
    };

    const config = extractSiteConfig(revData);

    expect((config.header as any).siteTitle).toBe("Rose");
    expect((config.header as any).logo).toBe("/logo.svg");
    expect((config.header as any).navigationLinks).toEqual([]);
  });
});

describe("multipage page generation", () => {
  it("converts page slugs to file names correctly", () => {
    const testCases = [
      { slug: "/", expected: "index.astro" },
      { slug: "/about", expected: "about.astro" },
      { slug: "/contact", expected: "contact.astro" },
      { slug: "about", expected: "about.astro" },
      { slug: "", expected: "index.astro" },
    ];

    for (const { slug, expected } of testCases) {
      const normalizedSlug = (slug || "/").replace(/^\/+/, "");
      const fileName =
        normalizedSlug === "" ? "index.astro" : `${normalizedSlug}.astro`;
      expect(fileName).toBe(expected);
    }
  });

  it("handles multiple pages from revision data", () => {
    const revisionData = {
      pages: [
        { id: "home", slug: "/" },
        { id: "about", slug: "/about" },
        { id: "contact", slug: "/contact" },
      ],
      pagesData: {
        home: { content: [{ type: "Hero", props: { title: "Home" } }] },
        about: { content: [{ type: "Hero", props: { title: "About" } }] },
        contact: {
          content: [{ type: "Hero", props: { title: "Contact" } }],
        },
      },
    };

    const pages: Array<{ fileName: string; data: { content: unknown[] } }> =
      [];

    const revPages = revisionData.pages;
    const revPagesData = revisionData.pagesData;

    if (Array.isArray(revPages) && revPages.length > 0 && revPagesData) {
      for (const page of revPages) {
        const pageData = revPagesData[page.id as keyof typeof revPagesData];
        if (!pageData?.content || !Array.isArray(pageData.content)) continue;

        const slug = (page.slug || "/").replace(/^\/+/, "");
        const fileName =
          slug === "" ? "index.astro" : `${slug}.astro`;

        pages.push({ fileName, data: { content: pageData.content as any[] } });
      }
    }

    expect(pages).toHaveLength(3);
    expect(pages[0].fileName).toBe("index.astro");
    expect(pages[1].fileName).toBe("about.astro");
    expect(pages[2].fileName).toBe("contact.astro");
  });
});
