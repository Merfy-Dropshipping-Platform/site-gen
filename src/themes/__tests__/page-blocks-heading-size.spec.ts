import { extractPageBlocks } from "../page-blocks";

jest.mock("../theme-manifest-loader", () => ({
  getThemeManifest: jest.fn().mockReturnValue(null),
  googleFontHead: jest.fn().mockReturnValue(""),
}));
jest.mock("../page-resolver-instance", () => ({
  getPageResolver: jest.fn(),
}));

describe("extractPageBlocks — legacy heading size adapters", () => {
  async function extract(
    type: "ContactForm" | "Gallery",
    props: Record<string, unknown>,
  ) {
    const blocks = await extractPageBlocks(
      {
        pagesData: {
          "page-home": {
            content: [{ type, props }],
          },
        },
      },
      "page-home",
      null,
      null,
      "site-1",
    );

    expect(blocks).not.toBeNull();
    return blocks![0].props;
  }

  it("ContactForm preserves nested heading size with nested precedence", async () => {
    const props = await extract("ContactForm", {
      heading: { text: "X", size: "large" },
      headingSize: "small",
    });

    expect(props.heading).toBe("X");
    expect(props.headingSize).toBe("large");
  });

  it("Gallery promotes legacy nested heading size when top-level size is missing", async () => {
    const props = await extract("Gallery", {
      heading: { text: "G", size: "large" },
    });

    expect(props.heading).toBe("G");
    expect(props.headingSize).toBe("large");
  });

  it("Gallery keeps a valid top-level heading size over the nested fallback", async () => {
    const props = await extract("Gallery", {
      heading: { text: "G", size: "large" },
      headingSize: "small",
    });

    expect(props.heading).toBe("G");
    expect(props.headingSize).toBe("small");
  });

  it("invalid nested sizes do not overwrite valid top-level sizes", async () => {
    const [contact, gallery] = await Promise.all([
      extract("ContactForm", {
        heading: { text: "X", size: "huge" },
        headingSize: "small",
      }),
      extract("Gallery", {
        heading: { text: "G", size: "huge" },
        headingSize: "large",
      }),
    ]);

    expect(contact.headingSize).toBe("small");
    expect(gallery.headingSize).toBe("large");
  });
});
