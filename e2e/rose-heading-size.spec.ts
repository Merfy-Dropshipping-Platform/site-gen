import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "playwright/test";

type HeadingSize = "small" | "medium" | "large";
type SectionName =
  | "ContactForm"
  | "Gallery"
  | "Collections"
  | "PopularProducts";

type LocalServer = {
  url: string;
  stop: () => Promise<void>;
};

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist", "theme-sections", "rose");

const EXPECTED_SIZES: Record<HeadingSize, { desktop: string; mobile: string }> =
  {
    small: { desktop: "17px", mobile: "12px" },
    medium: { desktop: "20px", mobile: "14px" },
    large: { desktop: "24px", mobile: "17px" },
  };

const SECTIONS: Array<{
  name: SectionName;
  headingSelector: string;
  props: (size: HeadingSize) => Record<string, unknown>;
}> = [
  {
    name: "ContactForm",
    headingSelector: "#contacts-title",
    props: (size) => ({
      id: "contact-heading-size-test",
      heading: { text: "Контактная форма", size },
      headingSize: "medium",
    }),
  },
  {
    name: "Gallery",
    headingSelector: "#gallery-title",
    props: (size) => ({
      id: "gallery-heading-size-test",
      heading: { text: "Галерея", size: "medium" },
      headingSize: size,
    }),
  },
  {
    name: "Collections",
    headingSelector: "#collections-title",
    props: (size) => ({
      id: "collections-heading-size-test",
      heading: "Список коллекций",
      headingSize: size,
    }),
  },
];

let manifest: Record<SectionName, string>;
let container: Awaited<ReturnType<typeof AstroContainer.create>>;
let previewTailwindCss: string;

test.beforeAll(async () => {
  execFileSync("corepack", ["pnpm", "build:theme-sections", "rose"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  execFileSync("corepack", ["pnpm", "build:preview-tailwind"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });

  manifest = JSON.parse(
    await readFile(path.join(DIST, "manifest.json"), "utf8"),
  ) as Record<SectionName, string>;
  previewTailwindCss = await readFile(
    path.join(ROOT, "dist", "preview-tailwind.css"),
    "utf8",
  );
  container = await AstroContainer.create();
});

for (const section of SECTIONS) {
  for (const size of Object.keys(EXPECTED_SIZES) as HeadingSize[]) {
    test(`${section.name} renders ${size} heading size on desktop and mobile`, async ({
      page,
    }) => {
      const html = await renderSection(section.name, section.props(size));
      const server = await startServer(html);

      try {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(server.url);
        await expect(page.locator(section.headingSelector)).toHaveCSS(
          "font-size",
          EXPECTED_SIZES[size].desktop,
        );

        await page.setViewportSize({ width: 375, height: 812 });
        await expect(page.locator(section.headingSelector)).toHaveCSS(
          "font-size",
          EXPECTED_SIZES[size].mobile,
        );
      } finally {
        await server.stop();
      }
    });
  }
}

test("Popular preserves its shared Rose heading baseline across the full CSS cascade", async ({
  page,
}) => {
  const html = await renderSection("PopularProducts", {
    id: "popular-heading-size-test",
    heading: { text: "Популярные товары" },
  });
  const server = await startServer(html);

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(server.url);
    await expect(page.locator("#popular-title")).toHaveCSS("font-size", "20px");

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator("#popular-title")).toHaveCSS("font-size", "14px");
  } finally {
    await server.stop();
  }
});

async function renderSection(
  name: SectionName,
  props: Record<string, unknown>,
): Promise<string> {
  const moduleName = manifest[name];
  if (!moduleName) {
    throw new Error(`Rose compiled manifest does not contain ${name}`);
  }

  const moduleUrl = pathToFileURL(path.join(DIST, moduleName)).href;
  const componentModule = await import(moduleUrl);
  const body = await container.renderToString(componentModule.default, {
    props,
  });

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Rose heading size verification</title>
    <style>${previewTailwindCss}</style>
    <style>html, body { margin: 0; padding: 0; }</style>
  </head>
  <body>${body}</body>
</html>`;
}

function startServer(html: string): Promise<LocalServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Local Rose verification server failed to bind"));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        stop: () =>
          new Promise<void>((resolveStop, rejectStop) => {
            server.close((error) =>
              error ? rejectStop(error) : resolveStop(),
            );
          }),
      });
    });
  });
}
