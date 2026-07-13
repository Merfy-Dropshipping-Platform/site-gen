import { extractPageBlocks } from "../page-blocks";

describe("Slideshow preview/live shared extraction", () => {
  it("returns the same canonical nested slide shape for both consumers", async () => {
    const data = {
      pagesData: {
        home: {
          content: [
            {
              type: "Slideshow",
              props: {
                slides: [
                  {
                    id: "slide-1",
                    heading: { text: "Heading", size: "large" },
                    text: { content: "Text", size: "small" },
                    button: {
                      text: "Open",
                      link: { href: "/catalog", text: "Catalog" },
                    },
                    position: "top-right",
                  },
                ],
                interval: 5,
                autoplay: true,
                padding: { top: 80, bottom: 80 },
              },
            },
          ],
        },
      },
    };

    const blocks = await extractPageBlocks(data, "home", null, null, "site-1");

    expect(blocks?.[0].props).toMatchObject({
      slides: [
        {
          heading: { text: "Heading", size: "large" },
          text: { content: "Text", size: "small" },
          button: { text: "Open", link: { href: "/catalog", text: "Catalog" } },
          position: "top-right",
        },
      ],
      siteId: "site-1",
    });
  });
});
