import { escapeHtml, patchPdpMetaTags } from "../seo-meta";

/**
 * Скелетный PDP-шелл — зеркало BaseHead.astro (themes/rose/src/components/
 * BaseHead.astro:41-61): og:* и twitter:* держат дефолты темы «Товар — Rose» +
 * placeholder + origin-root без id. Это ВХОД в patchPdpMetaTags (домен уже
 * пофикшен выше по пайплайну — потому origin реальный, а путь/значения скелетные).
 */
const SKELETON = [
  `<!doctype html><html><head>`,
  `<link rel="canonical" href="https://shop.example/product/" />`,
  `<title>Товар — Rose</title>`,
  `<meta name="title" content="Товар — Rose" />`,
  `<meta name="description" content="Уютный магазин цветов" />`,
  `<meta property="og:type" content="website" />`,
  `<meta property="og:url" content="https://shop.example/product/" />`,
  `<meta property="og:title" content="Товар — Rose" />`,
  `<meta property="og:description" content="Уютный магазин цветов" />`,
  `<meta property="og:image" content="https://shop.example/blog-placeholder-1.jpg" />`,
  `<meta property="twitter:card" content="summary_large_image" />`,
  `<meta property="twitter:url" content="https://shop.example/product/" />`,
  `<meta property="twitter:title" content="Товар — Rose" />`,
  `<meta property="twitter:description" content="Уютный магазин цветов" />`,
  `<meta property="twitter:image" content="https://shop.example/blog-placeholder-1.jpg" />`,
  `</head><body></body></html>`,
].join("\n");

const PUB = "https://shop.example";
const SITE_TITLE = "Rose";

/** content="…" конкретного <meta property="X">. null если тег/атрибут не найден. */
function metaProp(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta\\b[^>]*\\bproperty=["']${prop}["'][^>]*\\bcontent=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? m[1] : null;
}
/** href="…" из <link rel="canonical">. */
function canonicalHref(html: string): string | null {
  const m = html.match(
    /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']*)["']/i,
  );
  return m ? m[1] : null;
}
/** текст <title>…</title>. */
function titleText(html: string): string | null {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1] : null;
}

describe("patchPdpMetaTags — twitter:* mirrors og:* (bug fix)", () => {
  it("patches twitter:title/image/url to match og:* for a real product", () => {
    const out = patchPdpMetaTags(
      SKELETON,
      {
        name: "Mazda CX-5",
        description: "Кроссовер Mazda CX-5 в наличии",
        image: "https://cdn.example/mazda.jpg",
      },
      "mazda-cx-5",
      SITE_TITLE,
      PUB,
    );

    // twitter:title = имя товара + суффикс, ровно как og:title (было «Товар — Rose»).
    expect(metaProp(out, "twitter:title")).toBe("Mazda CX-5 — Rose");
    expect(metaProp(out, "twitter:title")).toBe(metaProp(out, "og:title"));

    // twitter:image = URL фото товара, ровно как og:image (было placeholder).
    expect(metaProp(out, "twitter:image")).toBe("https://cdn.example/mazda.jpg");
    expect(metaProp(out, "twitter:image")).toBe(metaProp(out, "og:image"));

    // twitter:url = canonical /product/<slug>, как og:url/canonical (было origin-root без id).
    expect(metaProp(out, "twitter:url")).toBe(
      "https://shop.example/product/mazda-cx-5",
    );
    expect(metaProp(out, "twitter:url")).toBe(metaProp(out, "og:url"));
    expect(metaProp(out, "twitter:url")).toBe(canonicalHref(out));

    // og:* остаются верны (регресс-гард — не сломали существующую логику).
    expect(metaProp(out, "og:title")).toBe("Mazda CX-5 — Rose");
    expect(metaProp(out, "og:image")).toBe("https://cdn.example/mazda.jpg");
    expect(metaProp(out, "og:url")).toBe("https://shop.example/product/mazda-cx-5");
    expect(titleText(out)).toBe("Mazda CX-5 — Rose");

    // twitter:description уже патчился до фикса — не задвоили, значение = og:description.
    expect(metaProp(out, "twitter:description")).toBe(
      "Кроссовер Mazda CX-5 в наличии",
    );
    expect(metaProp(out, "twitter:description")).toBe(metaProp(out, "og:description"));

    // twitter:card не трогаем.
    expect(metaProp(out, "twitter:card")).toBe("summary_large_image");
  });

  it("resolves the image from images[0] {url} for twitter:image (same source as og:image)", () => {
    const out = patchPdpMetaTags(
      SKELETON,
      { name: "Товар Б", images: [{ url: "https://cdn.example/b.png" }] },
      "tovar-b",
      SITE_TITLE,
      PUB,
    );
    expect(metaProp(out, "twitter:image")).toBe("https://cdn.example/b.png");
    expect(metaProp(out, "twitter:image")).toBe(metaProp(out, "og:image"));
  });

  it("HTML-escapes name and image in twitter:* (XSS-guard, mirrors og:*)", () => {
    const rawName = `A & B "C" <script>alert(1)</script> 'q'`;
    const rawImg = `https://cdn.example/x.jpg?a=1&b=2`;
    const out = patchPdpMetaTags(
      SKELETON,
      { name: rawName, image: rawImg },
      "xss",
      SITE_TITLE,
      PUB,
    );

    const escapedTitle = escapeHtml(`${rawName} — ${SITE_TITLE}`);
    const escapedImg = escapeHtml(rawImg);

    // Экранированные значения реально попали в разметку (точная подстановка).
    expect(out).toContain(`property="twitter:title" content="${escapedTitle}"`);
    expect(out).toContain(`property="twitter:image" content="${escapedImg}"`);
    // Зеркалит og:*.
    expect(out).toContain(`property="og:title" content="${escapedTitle}"`);
    expect(out).toContain(`property="og:image" content="${escapedImg}"`);

    // Ни одного сырого спецсимвола, ломающего атрибут/дающего XSS.
    expect(escapedTitle).toContain("&quot;");
    expect(escapedTitle).toContain("&lt;script&gt;");
    expect(escapedTitle).toContain("&amp;");
    expect(escapedImg).toBe("https://cdn.example/x.jpg?a=1&amp;b=2");
    expect(out).not.toContain("<script>alert(1)</script>");
  });

  it("does NOT blank the skeleton when name/image are empty (symmetric with og:*)", () => {
    const out = patchPdpMetaTags(
      SKELETON,
      { name: "", description: "" }, // ни имени, ни фото, ни описания
      "empty",
      SITE_TITLE,
      "", // pub пуст → canonical/og:url/twitter:url тоже не трогаем
    );

    // Скелетные значения сохранены — не затёрты «в пусто».
    expect(metaProp(out, "twitter:title")).toBe("Товар — Rose");
    expect(metaProp(out, "twitter:title")).toBe(metaProp(out, "og:title"));
    expect(metaProp(out, "twitter:image")).toBe(
      "https://shop.example/blog-placeholder-1.jpg",
    );
    expect(metaProp(out, "twitter:image")).toBe(metaProp(out, "og:image"));
    expect(metaProp(out, "twitter:url")).toBe("https://shop.example/product/");
    expect(metaProp(out, "twitter:url")).toBe(metaProp(out, "og:url"));
    expect(titleText(out)).toBe("Товар — Rose");
  });

  it("patches twitter:url even with empty name (url gated on pub, not name — mirrors og:url)", () => {
    const out = patchPdpMetaTags(
      SKELETON,
      { name: "" }, // имени нет — title/twitter:title остаются скелетом …
      "only-url",
      SITE_TITLE,
      PUB, // … но pub есть → canonical/og:url/twitter:url патчатся под slug
    );
    expect(metaProp(out, "twitter:url")).toBe("https://shop.example/product/only-url");
    expect(metaProp(out, "twitter:url")).toBe(metaProp(out, "og:url"));
    expect(metaProp(out, "twitter:title")).toBe("Товар — Rose"); // не тронут
  });
});
