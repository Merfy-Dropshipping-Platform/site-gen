#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = "/tmp/merfy-rose-qa/section-settings-batch";
const compiledDir = join(root, "dist/theme-sections/rose");
const cssPath = join(outputDir, "rose.css");
const htmlPath = join(outputDir, "index.html");

await mkdir(outputDir, { recursive: true });
execFileSync(
  "pnpm",
  [
    "exec",
    "tailwindcss",
    "-i",
    "themes/rose/src/styles/global.css",
    "-o",
    cssPath,
  ],
  { cwd: root, stdio: "inherit" },
);

const manifest = JSON.parse(
  await readFile(join(compiledDir, "manifest.json"), "utf8"),
);
const load = async (name) =>
  (await import(pathToFileURL(join(compiledDir, manifest[name])).href)).default;
const container = await AstroContainer.create();
const render = async (name, props) =>
  container.renderToString(await load(name), { props });

const promo = await render("PromoBanner", {
  id: "qa-promo",
  text: "Тонкая панель",
  size: "thin",
});
const footer = await render("Footer", {
  id: "qa-footer",
  newsletter: { enabled: true, placeholder: "Email" },
  heading: { text: "Размер заголовка", size: "large" },
  text: { content: "Размер текста", size: "small" },
  navigationColumn: { links: [] },
  informationColumn: { links: [] },
  socialColumn: { socialLinks: [] },
  padding: { top: 20, bottom: 20 },
});
const multiRows = await render("MultiRows", {
  id: "qa-multirows",
  rows: [
    {
      id: "row-1",
      heading: "Legacy secondary",
      button: { text: "Кнопка", href: "/" },
    },
  ],
  buttonStyle: "secondary",
  padding: { top: 20, bottom: 20 },
});
const slideshow = await render("Slideshow", {
  id: "qa-slideshow",
  slides: [
    {
      id: "slide-1",
      imageUrl:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='%23999'/%3E%3C/svg%3E",
      heading: "Legacy position",
      container: "false",
      alignment: "center",
    },
  ],
  size: "small",
  autoplay: false,
  padding: { top: 0, bottom: 0 },
});

await writeFile(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/rose.css"><style>body{margin:0}[data-animate]{opacity:1!important;transform:none!important}</style></head><body>${promo}${slideshow}${multiRows}${footer}</body></html>`,
);

const server = createServer(async (request, response) => {
  const file = request.url === "/rose.css" ? cssPath : htmlPath;
  response.setHeader(
    "content-type",
    request.url === "/rose.css" ? "text/css" : "text/html; charset=utf-8",
  );
  response.end(await readFile(file));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
const url = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "networkidle" });
    const measurements = await page.evaluate(() => {
      const style = (selector) =>
        getComputedStyle(document.querySelector(selector));
      const promo = document.querySelector(
        '[data-puck-component-id="qa-promo"] [data-nt="promo-banner"]',
      );
      const slideContent = document.querySelector(
        '[data-puck-component-id="qa-slideshow"] [data-slide] > div:nth-child(2)',
      );
      return {
        promoHeight: promo.getBoundingClientRect().height,
        promoFontSize: style('[data-puck-component-id="qa-promo"] p').fontSize,
        slideshowJustify: getComputedStyle(slideContent).justifyContent,
        footerHeadingFontSize: style(
          '[data-puck-component-id="qa-footer"] #newsletter-heading',
        ).fontSize,
        footerTextFontSize: style(
          '[data-puck-component-id="qa-footer"] [aria-labelledby="newsletter-heading"] > div > p',
        ).fontSize,
        multiRowsButtonBackground: style(
          '[data-puck-component-id="qa-multirows"] a',
        ).backgroundColor,
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });
    const expectedHeading = viewport.name === "mobile" ? "17px" : "24px";
    const pass =
      measurements.promoHeight === 32 &&
      measurements.promoFontSize === "12px" &&
      measurements.slideshowJustify === "center" &&
      measurements.footerHeadingFontSize === expectedHeading &&
      measurements.footerTextFontSize === "14px" &&
      measurements.multiRowsButtonBackground === "rgb(255, 255, 255)" &&
      !measurements.overflow;
    results.push({ viewport: viewport.name, pass, ...measurements });
    await page.screenshot({
      path: join(outputDir, `${viewport.name}.png`),
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

await writeFile(
  join(outputDir, "results.json"),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
if (results.some(({ pass }) => !pass)) process.exitCode = 1;
