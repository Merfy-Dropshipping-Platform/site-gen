/**
 * Страницы блога на витрине (PUB-1, PUB-2): «Блог» `/blogs/{handle}` и
 * «Запись блога» `/blogs/{handle}/{slug}` у всех пяти тем.
 *
 * Механизм — тот же, что у страниц товара и коллекции: системная страница в
 * реестре (её секции правятся в конструкторе), а на сборке — по копии на каждый
 * блог и каждую запись, тело рендерится секцией с данными магазина. Старые
 * адреса — страницы-переадресации (как catalog-redirects), архивные записи —
 * страница «запись снята».
 *
 * Требует сборки для рендера секций: pnpm build && pnpm build:blocks &&
 * pnpm build:theme-sections <тема>. Без неё рендер-проверки молчат, остальное
 * гоняется всегда.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  PAGE_REGISTRY,
  VERBATIM_PREFIXES,
  getChromeKind,
  getContentPages,
  getSystemPageRoute,
  isReservedRoute,
  isVerbatimRoute,
} from "../page-registry";
import { migrateRevisionData } from "../../utils/revision-migrations";
import { THEME_PUCK_BASE_BLOCK_NAMES } from "../theme-puck-block-catalog";
import {
  planBlogPages,
  planBlogRedirects,
  patchBlogPageMeta,
  writeBlogRedirectsIntoDist,
  type BlogRouteData,
} from "../blog-pages";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

const PAGES = [
  { id: "page-blog", name: "Блог", slug: "/blogs/preview", block: "BlogSection", file: "pages/blog.json" },
  {
    id: "page-blog-post",
    name: "Запись блога",
    slug: "/blogs/preview/post",
    block: "BlogPostSection",
    file: "pages/blog-post.json",
  },
] as const;

describe("системные страницы «Блог» и «Запись блога» в реестре", () => {
  it.each(PAGES)("$id — контентная страница, видна конструктору", (page) => {
    const entry = PAGE_REGISTRY.find((e) => e.id === page.id);
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("content");
    expect(entry?.route).toBe(page.slug.slice(1));
    expect(getSystemPageRoute(page.id)).toBe(page.slug.slice(1));
    expect(getChromeKind(page.slug.slice(1))).toBe("full");
  });

  it("страницы блога не пересаживаются общим циклом (их собирает сборка блога)", () => {
    const keys = getContentPages()
      .filter((p) => p.key.startsWith("page-blog"))
      .map((p) => [p.key, p.requireOwnShell]);
    expect(keys).toEqual([
      ["page-blog", true],
      ["page-blog-post", true],
    ]);
  });

  it("'blog' больше не verbatim — стартовый шаблон Astro удалён", () => {
    expect(VERBATIM_PREFIXES.has("blog")).toBe(false);
    expect(isVerbatimRoute("blog")).toBe(false);
    expect(isVerbatimRoute("blogs/novosti")).toBe(false);
  });

  it("но /blog и /blogs/* заняты витриной: страница продавца их не перезапишет", () => {
    expect(isReservedRoute("blog")).toBe(true);
    expect(isReservedRoute("blogs")).toBe(true);
    expect(isReservedRoute("blogs/novosti/zapis")).toBe(true);
    expect(isReservedRoute("product")).toBe(true);
    expect(isReservedRoute("about-us")).toBe(false);
  });

  it("секции страниц — в каталоге блоков (конструктор их знает), в палитру не идут", () => {
    expect(THEME_PUCK_BASE_BLOCK_NAMES).toEqual(
      expect.arrayContaining(["BlogSection", "BlogPostSection"]),
    );
  });
});

describe.each(THEMES)("стартового шаблона Astro больше нет — %s", (theme) => {
  const src = resolve(SITES_ROOT, "themes", theme, "src");

  it.each([
    "pages/blog",
    "content/blog",
    "content.config.ts",
    "layouts/BlogPost.astro",
    "components/FormattedDate.astro",
    "pages/rss.xml.js",
  ])("нет %s", (rel) => {
    expect(existsSync(join(src, rel))).toBe(false);
  });

  it("нет английских дат и lang=\"en\" в исходниках темы", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(astro|ts|js|mjs)$/.test(entry.name)) {
          const body = readFileSync(full, "utf-8");
          if (/['"]en-us['"]|<html lang="en"/i.test(body)) offenders.push(full);
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});

describe.each(THEMES)("манифест темы %s", (theme) => {
  const pkg = resolve(SITES_ROOT, "packages", `theme-${theme}`);
  const manifest = JSON.parse(readFileSync(resolve(pkg, "theme.json"), "utf-8")) as {
    pages?: Array<{ id: string; name: string; slug: string; role?: string; contentFile: string }>;
  };

  it.each(PAGES)("объявляет $id с сидом, где ровно одна секция страницы", (page) => {
    const entry = (manifest.pages ?? []).find((p) => p.id === page.id);
    expect(entry).toEqual(
      expect.objectContaining({ name: page.name, slug: page.slug, role: "system", contentFile: page.file }),
    );
    const seed = JSON.parse(readFileSync(resolve(pkg, page.file), "utf-8")) as {
      content?: Array<{ type?: string }>;
    };
    const types = (seed.content ?? []).map((b) => b.type);
    expect(types.filter((t) => t === page.block)).toHaveLength(1);
    expect(types).toContain("Header");
    expect(types).toContain("Footer");
  });

  it("ни один другой сид не содержит секций блога", () => {
    const dir = resolve(pkg, "pages");
    const guilty = readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !PAGES.some((p) => p.file === `pages/${f}`))
      .filter((f) => /"type":\s*"Blog(Post)?Section"/.test(readFileSync(resolve(dir, f), "utf-8")));
    expect(guilty).toEqual([]);
  });
});

describe("сидер досевает страницы блога живым сайтам", () => {
  const liveLike = () => ({
    pages: [{ id: "home", name: "Главная", slug: "/", role: "system" }],
    pagesData: {
      home: {
        content: [
          { type: "Header", props: { id: "Header-1", siteTitle: "Магазин" } },
          { type: "Footer", props: { id: "Footer-1" } },
        ],
        root: { props: {} },
        zones: {},
      },
    },
  });

  type Doc = {
    pages: Array<{ id: string; name?: string; slug?: string }>;
    pagesData: Record<string, { content: Array<{ type?: string; props?: Record<string, unknown> }> }>;
  };

  it.each(PAGES)("$id: запись страницы и [Header, секция, Footer]", (page) => {
    const after = migrateRevisionData(liveLike(), "flux") as Doc;
    const meta = after.pages.find((p) => p.id === page.id);
    expect(meta).toEqual(expect.objectContaining({ name: page.name, slug: page.slug }));
    expect(after.pagesData[page.id].content.map((b) => b.type)).toEqual([
      "Header",
      page.block,
      "Footer",
    ]);
  });

  it("повторный прогон ничего не удваивает и не трогает правки", () => {
    const once = migrateRevisionData(liveLike(), "flux") as Doc;
    once.pagesData["page-blog"].content[1].props = { id: "BlogSection-1", colorScheme: 4 };
    const twice = migrateRevisionData(once, "flux") as Doc;
    expect(twice.pages.filter((p) => p.id === "page-blog")).toHaveLength(1);
    expect(twice.pagesData["page-blog"].content[1].props).toEqual({ id: "BlogSection-1", colorScheme: 4 });
  });
});

const DATA: BlogRouteData = {
  blogs: [
    { id: "b-news", handle: "novosti", title: "Новости" },
    { id: "b-stati", handle: "stati", title: "Статьи" },
    { id: "b-empty", handle: "pusto", title: "Пустой блог" },
  ],
  publications: [
    {
      id: "p1",
      title: "Открытие",
      slug: "otkrytie",
      blogId: "b-news",
      blogHandle: "novosti",
      blogTitle: "Новости",
      excerpt: "Автоанонс открытия",
      content: "<p>Текст</p>",
      seoTitle: null,
      seoDescription: null,
      coverImageUrl: "https://cdn/1.jpg",
      publishedAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "p2",
      title: "Гид",
      slug: "gid",
      blogId: "b-stati",
      blogHandle: "stati",
      blogTitle: "Статьи",
      excerpt: "Анонс гида",
      content: "<p>Гид</p>",
      seoTitle: "SEO гида",
      seoDescription: "Описание гида",
      coverImageUrl: null,
      publishedAt: "2026-08-01T10:00:00.000Z",
    },
  ],
  archived: [{ id: "p3", slug: "staroe", blogHandle: "novosti" }],
  redirects: [
    { oldPath: "/blogs/novosti/gid-staryj", publicationId: "p2" },
    { oldPath: "/blogs/novosti/arhiv-staryj", publicationId: "p3" },
    { oldPath: "/blogs/novosti/otkrytie", publicationId: "p2" },
  ],
};

describe("план страниц блога на сборке", () => {
  const plan = planBlogPages(DATA);

  it("страница на каждый блог (и пустой тоже) и на каждую запись", () => {
    expect(plan.map((p) => p.route).sort()).toEqual([
      "blogs/novosti",
      "blogs/novosti/otkrytie",
      "blogs/pusto",
      "blogs/stati",
      "blogs/stati/gid",
    ]);
  });

  it("страница блога получает адрес и название блога в секцию", () => {
    const blog = plan.find((p) => p.route === "blogs/stati")!;
    expect(blog).toEqual(
      expect.objectContaining({ pageKey: "page-blog", props: { blogHandle: "stati", blogTitle: "Статьи" } }),
    );
    expect(blog.meta.title).toBe("Статьи");
  });

  it("страница записи: SEO-поля, пусто — заголовок и автоанонс", () => {
    const own = plan.find((p) => p.route === "blogs/stati/gid")!;
    expect(own.pageKey).toBe("page-blog-post");
    expect(own.props).toEqual({ publicationId: "p2" });
    expect(own.meta).toEqual(
      expect.objectContaining({ title: "SEO гида", description: "Описание гида", path: "/blogs/stati/gid" }),
    );
    const auto = plan.find((p) => p.route === "blogs/novosti/otkrytie")!;
    expect(auto.meta).toEqual(
      expect.objectContaining({ title: "Открытие", description: "Автоанонс открытия", image: "https://cdn/1.jpg" }),
    );
  });
});

describe("старые адреса: 301 и 410", () => {
  const { moved, gone } = planBlogRedirects(DATA);
  const to = (from: string) => moved.find((m) => m.from === from)?.to;

  it("/publication/{slug} и /publications/{slug} → новый адрес", () => {
    expect(to("/publication/otkrytie")).toBe("/blogs/novosti/otkrytie");
    expect(to("/publications/gid")).toBe("/blogs/stati/gid");
  });

  it("старый адрес из publication_redirects → нынешний адрес записи", () => {
    expect(to("/blogs/novosti/gid-staryj")).toBe("/blogs/stati/gid");
  });

  it("старый адрес, который снова занят живой записью, не переадресуется", () => {
    expect(to("/blogs/novosti/otkrytie")).toBeUndefined();
  });

  it("/blog → блог по умолчанию «Новости»", () => {
    expect(to("/blog")).toBe("/blogs/novosti");
  });

  it("/blog без «Новостей» → первый блог магазина", () => {
    const noNews = planBlogRedirects({ ...DATA, blogs: DATA.blogs.slice(1) });
    expect(noNews.moved.find((m) => m.from === "/blog")?.to).toBe("/blogs/stati");
  });

  it("архивная запись — 410 по всем её адресам", () => {
    expect(gone.sort()).toEqual([
      "/blogs/novosti/arhiv-staryj",
      "/blogs/novosti/staroe",
      "/publication/staroe",
      "/publications/staroe",
    ]);
  });
});

describe("страницы переадресации в дисте", () => {
  it("пишет переадресацию и страницу 410, живые страницы не трогает", async () => {
    const dist = mkdtempSync(join(tmpdir(), "blog-redirects-"));
    await fs.mkdir(join(dist, "blogs", "novosti", "otkrytie"), { recursive: true });
    await fs.writeFile(join(dist, "blogs", "novosti", "otkrytie", "index.html"), "ЖИВАЯ", "utf8");

    const result = await writeBlogRedirectsIntoDist(
      dist,
      {
        moved: [
          { from: "/publication/otkrytie", to: "/blogs/novosti/otkrytie" },
          { from: "/blogs/novosti/otkrytie", to: "/blogs/stati/gid" },
          { from: "/../evil", to: "/blogs/x" },
        ],
        gone: ["/blogs/novosti/staroe"],
      },
      "https://shop.example",
    );
    expect(result).toEqual({ moved: 1, gone: 1, skipped: 2 });

    const redirect = await fs.readFile(join(dist, "publication", "otkrytie", "index.html"), "utf8");
    expect(redirect).toContain('<html lang="ru">');
    expect(redirect).toContain('http-equiv="refresh" content="0; url=/blogs/novosti/otkrytie"');
    expect(redirect).toContain('rel="canonical" href="https://shop.example/blogs/novosti/otkrytie"');

    const goneHtml = await fs.readFile(join(dist, "blogs", "novosti", "staroe", "index.html"), "utf8");
    expect(goneHtml).toContain('<meta name="robots" content="noindex">');
    expect(goneHtml).toContain("Запись больше недоступна");

    expect(await fs.readFile(join(dist, "blogs", "novosti", "otkrytie", "index.html"), "utf8")).toBe("ЖИВАЯ");
  });
});

describe("SEO-мета страницы записи", () => {
  const SHELL =
    '<html lang="ru"><head><title>Магазин</title>' +
    '<meta name="description" content="Описание магазина">' +
    '<meta property="og:title" content="Магазин">' +
    '<meta property="og:description" content="Описание магазина">' +
    '<meta property="og:url" content="https://shop.example/">' +
    '<meta property="og:image" content="https://shop.example/og.png">' +
    '<link rel="canonical" href="https://shop.example/">' +
    "</head><body></body></html>";

  it("title/description/canonical/og — из записи, с экранированием", () => {
    const html = patchBlogPageMeta(
      SHELL,
      { title: 'Гид "размеры"', description: "Описание <гида>", path: "/blogs/stati/gid", image: "https://cdn/1.jpg" },
      "https://shop.example",
    );
    expect(html).toContain("<title>Гид &quot;размеры&quot;</title>");
    expect(html).toContain('name="description" content="Описание &lt;гида&gt;"');
    expect(html).toContain('property="og:description" content="Описание &lt;гида&gt;"');
    expect(html).toContain('rel="canonical" href="https://shop.example/blogs/stati/gid"');
    expect(html).toContain('property="og:url" content="https://shop.example/blogs/stati/gid"');
    expect(html).toContain('property="og:image" content="https://cdn/1.jpg"');
  });

  it("нет описания — описание шелла не трогается", () => {
    const html = patchBlogPageMeta(SHELL, { title: "Блог", path: "/blogs/novosti" }, "");
    expect(html).toContain("<title>Блог</title>");
    expect(html).toContain('name="description" content="Описание магазина"');
  });
});

describe.each(THEMES)("рендер секций блога — %s", (theme) => {
  const built = existsSync(resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"));
  const render = (block: string, props: Record<string, unknown>, publications: unknown[]) => {
    const raw = execFileSync(
      "node",
      [
        RENDERER,
        theme,
        JSON.stringify([{ block, props, live: true, cascade: true, catalog: { publications } }]),
      ],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 128 * 1024 * 1024 },
    );
    return (JSON.parse(raw) as Array<{ html?: string; error?: string; missing?: boolean }>)[0];
  };

  const many = Array.from({ length: 14 }, (_, i) => ({
    id: `n${i}`,
    title: `Запись ${i}`,
    slug: `zapis-${i}`,
    blogId: "b-news",
    blogHandle: "novosti",
    blogTitle: "Новости",
    excerpt: `Анонс ${i}`,
    content: `<p>Текст ${i}</p><script>alert(1)</script>`,
    coverImageUrl: null,
    publishedAt: new Date(Date.UTC(2025, 0, 1 + i, 9)).toISOString(),
  }));

  it("«Блог»: заголовок блога, 12 записей на странице, новые сверху, переход по страницам", () => {
    if (!built) return;
    const row = render("BlogSection", { id: "BlogSection-1", blogHandle: "novosti", blogTitle: "Новости" }, many);
    expect(row.error).toBeUndefined();
    expect(row.missing).toBeFalsy();
    const html = row.html ?? "";
    expect(html).toContain("Новости");
    // Новые сверху: запись 13 (14 января) первой.
    expect(html.indexOf("Запись 13")).toBeLessThan(html.indexOf("Запись 0"));
    expect(html).toContain('href="/blogs/novosti/zapis-13"');
    expect(html).toContain("14 января 2025");
    expect((html.match(/data-blog-page="1"/g) ?? []).length).toBe(12);
    expect((html.match(/data-blog-page="2"/g) ?? []).length).toBe(2);
    expect(html).toContain('href="/blogs/novosti?page=2"');
  });

  it("«Запись блога»: заголовок, дата по-русски, текст без скриптов, ссылка на блог", () => {
    if (!built) return;
    const row = render("BlogPostSection", { id: "BlogPostSection-1", publicationId: "n3" }, many);
    expect(row.error).toBeUndefined();
    const html = row.html ?? "";
    expect(html).toContain("Запись 3");
    expect(html).toContain("4 января 2025");
    expect(html).toContain("<p>Текст 3</p>");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain('href="/blogs/novosti"');
  });
});
