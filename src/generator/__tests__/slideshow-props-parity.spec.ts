import {
  generateAstroPage,
  type ComponentRegistryEntry,
} from "../page-generator";
import { normalizeSlideshowProps } from "../legacy-prop-normalizer";

const registry: Record<string, ComponentRegistryEntry> = {
  Slideshow: {
    name: "Slideshow",
    kind: "static",
    importPath: "../components/Slideshow.astro",
  },
};

describe("Slideshow generated props", () => {
  it("keeps intentionally empty current fields instead of reviving legacy aliases", () => {
    const normalized = normalizeSlideshowProps({
      slides: [
        {
          id: "cleared-slide",
          image: "",
          imageUrl: "/legacy.jpg",
          text: { content: "", size: "small" },
          subtitle: "Legacy text",
          button: { text: "", link: "" },
          ctaText: "Legacy CTA",
          ctaUrl: "/legacy",
        },
      ],
    });

    expect(normalized.slides).toEqual([
      expect.objectContaining({
        image: "",
        text: { content: "", size: "small" },
        button: { text: "", link: { href: "" } },
      }),
    ]);
  });

  it("preserves semantic nested fields and canonicalizes PagePicker links", () => {
    const generated = generateAstroPage(
      {
        content: [
          {
            type: "Slideshow",
            props: {
              slides: [
                {
                  id: "slide-1",
                  image: "/current.jpg",
                  imageUrl: "/legacy.jpg",
                  heading: { text: "Current heading", size: "large" },
                  text: { content: "Current text", size: "small" },
                  subtitle: "Legacy text",
                  button: {
                    text: "Current CTA",
                    link: { href: "/current", text: "Page" },
                  },
                  ctaText: "Legacy CTA",
                  ctaUrl: "/legacy",
                },
              ],
              interval: 5,
              autoplay: true,
              padding: { top: 80, bottom: 80 },
            },
          },
        ],
      },
      registry,
    );

    expect(generated).toContain(
      '"heading":{"text":"Current heading","size":"large"}',
    );
    expect(generated).toContain(
      '"text":{"content":"Current text","size":"small"}',
    );
    expect(generated).toContain(
      '"button":{"text":"Current CTA","link":{"href":"/current","text":"Page"}}',
    );
    expect(generated).not.toContain('"button":{"text":"Current CTA","href"');
  });

  it("canonicalizes legacy slide fields without losing their content", () => {
    const generated = generateAstroPage(
      {
        content: [
          {
            type: "Slideshow",
            props: {
              slides: [
                {
                  id: "legacy-slide",
                  imageUrl: "/legacy.jpg",
                  heading: "Legacy heading",
                  subtitle: "Legacy text",
                  ctaText: "Legacy CTA",
                  ctaUrl: "/legacy",
                },
              ],
              interval: 5,
              autoplay: true,
              padding: { top: 0, bottom: 0 },
            },
          },
        ],
      },
      registry,
    );

    expect(generated).toContain('"heading":{"text":"Legacy heading"}');
    expect(generated).toContain('"text":{"content":"Legacy text"}');
    expect(generated).toContain(
      '"button":{"text":"Legacy CTA","link":{"href":"/legacy"}}',
    );
  });
});
