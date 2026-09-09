import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  buildFaviconHead,
  buildWebManifest,
  applyFaviconHeadToHtml,
  injectFavicons,
  FAVICON_MARKER,
  WEB_MANIFEST_PATH,
} from "../favicon-inject";

const S3 = "https://s3.merfy.ru/merfy-sites/branding/t1/s1";

describe("favicon-inject — buildFaviconHead", () => {
  it("пустой набор → пустая строка (noop)", () => {
    expect(buildFaviconHead(undefined)).toBe("");
    expect(buildFaviconHead(null)).toBe("");
    expect(buildFaviconHead({ favicons: {} })).toBe("");
    expect(buildFaviconHead({ favicons: undefined, primaryColor: "#fff" })).toBe("");
  });

  it("только universal (.svg) → один rel=icon с type svg и маркером, без media/apple/manifest", () => {
    const out = buildFaviconHead({ favicons: { universal: `${S3}/u.svg` } });
    expect(out).toContain(`rel="icon"`);
    expect(out).toContain(`href="${S3}/u.svg"`);
    expect(out).toContain(`type="image/svg+xml"`);
    expect(out).toContain(FAVICON_MARKER);
    expect(out).not.toContain("media=");
    expect(out).not.toContain("apple-touch-icon");
    expect(out).not.toContain("rel=\"manifest\"");
    expect(out.match(/<link/g)?.length).toBe(1);
  });

  it("все 4 варианта → порядок universal → dark → light → apple; media на dark/light; apple = apple-touch-icon", () => {
    const out = buildFaviconHead({
      favicons: {
        universal: `${S3}/u.png`,
        dark: `${S3}/d.png`,
        light: `${S3}/l.png`,
        apple: `${S3}/a.png`,
      },
    });
    const iUni = out.indexOf(`${S3}/u.png`);
    const iDark = out.indexOf(`${S3}/d.png`);
    const iLight = out.indexOf(`${S3}/l.png`);
    const iApple = out.indexOf(`${S3}/a.png`);
    expect(iUni).toBeGreaterThanOrEqual(0);
    expect(iUni).toBeLessThan(iDark);
    expect(iDark).toBeLessThan(iLight);
    expect(iLight).toBeLessThan(iApple);
    expect(out).toContain(`media="(prefers-color-scheme: dark)"`);
    expect(out).toContain(`media="(prefers-color-scheme: light)"`);
    expect(out).toContain(`rel="apple-touch-icon" ${FAVICON_MARKER} href="${S3}/a.png"`);
  });

  it("dark без universal → база-фолбэк = dark + media-скоуп dark", () => {
    const out = buildFaviconHead({ favicons: { dark: `${S3}/d.png` } });
    // одна база rel=icon (без media) и одна с media dark — обе на dark-URL
    expect(out.match(/rel="icon"/g)?.length).toBe(2);
    expect(out).toContain(`media="(prefers-color-scheme: dark)"`);
    expect(out).not.toContain("media=\"(prefers-color-scheme: light)\"");
  });

  it("только apple → apple-touch-icon, БЕЗ базового rel=icon", () => {
    const out = buildFaviconHead({ favicons: { apple: `${S3}/a.png` } }, { manifestHref: WEB_MANIFEST_PATH });
    expect(out).toContain("apple-touch-icon");
    expect(out).not.toContain(`rel="icon"`);
    expect(out).toContain(`rel="manifest"`);
  });

  it("type выводится из расширения; неизвестное расширение → без type", () => {
    expect(buildFaviconHead({ favicons: { universal: `${S3}/x.ico` } })).toContain(`type="image/x-icon"`);
    expect(buildFaviconHead({ favicons: { universal: `${S3}/x.jpg` } })).toContain(`type="image/jpeg"`);
    const noExt = buildFaviconHead({ favicons: { universal: `${S3}/logo` } });
    expect(noExt).toContain(`href="${S3}/logo"`);
    expect(noExt).not.toContain("type=");
  });

  it("manifestHref и primaryColor добавляют manifest-линк и theme-color", () => {
    const out = buildFaviconHead(
      { favicons: { universal: `${S3}/u.svg` }, primaryColor: "#71c0ff" },
      { manifestHref: "/site.webmanifest" },
    );
    expect(out).toContain(`<link rel="manifest" ${FAVICON_MARKER} href="/site.webmanifest">`);
    expect(out).toContain(`<meta name="theme-color" ${FAVICON_MARKER} content="#71c0ff">`);
  });

  it("& в URL экранируется в атрибуте", () => {
    const out = buildFaviconHead({ favicons: { universal: `${S3}/u.png?a=1&b=2` } });
    expect(out).toContain("a=1&amp;b=2");
    expect(out).not.toContain("a=1&b=2");
  });

  it("пустые строки трактуются как незаданные (|| фолбэк, не ??)", () => {
    const out = buildFaviconHead({ favicons: { universal: "", dark: `${S3}/d.png` } });
    expect(out).not.toContain(`href=""`); // пустой слот не эмитит битый <link>
    expect(out).toContain(`href="${S3}/d.png"`); // база взята из dark
    // всё пустое → полный noop
    expect(buildFaviconHead({ favicons: { universal: "", dark: "", light: "", apple: "" } })).toBe("");
  });
});

describe("favicon-inject — buildWebManifest", () => {
  it("apple (png) → icons 192(any) + 512(maskable) с type png", () => {
    const m = JSON.parse(buildWebManifest({ favicons: { apple: `${S3}/a.png` } }));
    expect(m.display).toBe("standalone");
    expect(m.icons).toHaveLength(2);
    expect(m.icons[0]).toMatchObject({ src: `${S3}/a.png`, sizes: "192x192", type: "image/png", purpose: "any" });
    expect(m.icons[1]).toMatchObject({ sizes: "512x512", purpose: "maskable" });
  });

  it("svg universal (без apple) → одна иконка sizes any", () => {
    const m = JSON.parse(buildWebManifest({ favicons: { universal: `${S3}/u.svg` } }));
    expect(m.icons).toEqual([{ src: `${S3}/u.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" }]);
  });

  it("name → name + short_name; цвета → theme_color/background_color", () => {
    const m = JSON.parse(
      buildWebManifest(
        { favicons: { apple: `${S3}/a.png` }, primaryColor: "#111", secondaryColor: "#eee" },
        { name: "Мой магазин" },
      ),
    );
    expect(m.name).toBe("Мой магазин");
    expect(m.short_name).toBe("Мой магазин");
    expect(m.theme_color).toBe("#111");
    expect(m.background_color).toBe("#eee");
  });

  it("пустые favicons → icons []", () => {
    const m = JSON.parse(buildWebManifest({ favicons: {} }));
    expect(m.icons).toEqual([]);
  });

  it("dark-only (без universal/apple) → иконка из dark, icons НЕ пустой", () => {
    const m = JSON.parse(buildWebManifest({ favicons: { dark: `${S3}/d.png` } }));
    expect(m.icons.length).toBeGreaterThan(0);
    expect(m.icons[0].src).toBe(`${S3}/d.png`);
  });

  it("empty-string universal → берётся apple (|| фолбэк)", () => {
    const m = JSON.parse(buildWebManifest({ favicons: { universal: "", apple: `${S3}/a.png` } }));
    expect(m.icons[0].src).toBe(`${S3}/a.png`);
  });
});

describe("favicon-inject — applyFaviconHeadToHtml (чистая)", () => {
  const HEAD = buildFaviconHead({ favicons: { universal: `${S3}/u.png` } }, { manifestHref: WEB_MANIFEST_PATH });

  it("пустой head → HTML как есть", () => {
    const html = "<html><head><title>x</title></head><body></body></html>";
    expect(applyFaviconHeadToHtml(html, "")).toBe(html);
  });

  it("вставляет блок перед </head>, ровно один </head>, body нетронут", () => {
    const html = `<html><head><meta charset="utf-8"><title>x</title></head><body><h1>hi</h1></body></html>`;
    const out = applyFaviconHeadToHtml(html, HEAD);
    expect(out.match(/<\/head>/gi)?.length).toBe(1);
    expect(out).toContain(FAVICON_MARKER);
    expect(out).toContain(`href="${S3}/u.png"`);
    expect(out).toContain("<body><h1>hi</h1></body>");
    expect(out.indexOf(FAVICON_MARKER)).toBeLessThan(out.indexOf("</head>"));
  });

  it("вырезает хардкод темы /page_logo.svg", () => {
    const html = `<html><head><link rel="icon" type="image/svg+xml" href="/page_logo.svg" /><title>x</title></head><body></body></html>`;
    const out = applyFaviconHeadToHtml(html, HEAD);
    expect(out).not.toContain("/page_logo.svg");
    expect(out).toContain(`href="${S3}/u.png"`);
  });

  it("вырезает только icon/apple-touch, оставляет stylesheet/preconnect (нежадность)", () => {
    const html = `<html><head><link rel="preconnect" href="https://fonts.gstatic.com"><link rel="stylesheet" href="/styles.css"><link rel="icon" href="/page_logo.svg"><link rel="apple-touch-icon" href="/old-apple.png"></head><body></body></html>`;
    const out = applyFaviconHeadToHtml(html, HEAD);
    expect(out).toContain(`rel="stylesheet" href="/styles.css"`);
    expect(out).toContain(`rel="preconnect"`);
    expect(out).not.toContain("/page_logo.svg");
    expect(out).not.toContain("/old-apple.png");
  });

  it("идемпотентность: повторный прогон (маркер уже есть) → без изменений", () => {
    const once = applyFaviconHeadToHtml("<html><head></head><body></body></html>", HEAD);
    expect(applyFaviconHeadToHtml(once, HEAD)).toBe(once);
  });

  it("без </head> → HTML как есть (чужой icon не удаляем вслепую)", () => {
    const html = `<div><link rel="icon" href="/page_logo.svg"></div>`;
    expect(applyFaviconHeadToHtml(html, HEAD)).toBe(html);
  });

  it("$-паттерны в URL вставляются дословно (замена </head> через функцию, не строку)", () => {
    // $1/$& в строке-замене String.replace интерпретировались бы; функция-замена
    // сохраняет их дословно. Берём $-паттерн без & (& экранируется escAttr отдельно).
    const head = buildFaviconHead({ favicons: { universal: `${S3}/u$1_x.png` } });
    const out = applyFaviconHeadToHtml("<html><head></head><body></body></html>", head);
    expect(out).toContain(`${S3}/u$1_x.png`);
  });
});

describe("favicon-inject — injectFavicons (dist walker, fs sandbox)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "favicon-inject-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const themeBaseHtml = `<html><head><meta charset="utf-8"><title>Home</title><slot name="head"></slot></head><body>home</body></html>`;
  const baseHeadHtml = `<html><head><link rel="icon" type="image/svg+xml" href="/page_logo.svg" /><title>Login</title></head><body>login</body></html>`;

  it("патчит все *.html (оба владельца head) + пишет site.webmanifest; /page_logo.svg исчезает", async () => {
    await fs.writeFile(path.join(dir, "index.html"), themeBaseHtml, "utf8");
    await fs.mkdir(path.join(dir, "account"), { recursive: true });
    await fs.writeFile(path.join(dir, "account", "index.html"), baseHeadHtml, "utf8");

    const count = await injectFavicons(
      dir,
      {
        favicons: { universal: `${S3}/u.png`, dark: `${S3}/d.png`, apple: `${S3}/a.png` },
        primaryColor: "#71c0ff",
      },
      { name: "Shop" },
    );
    expect(count).toBe(2);

    const home = await fs.readFile(path.join(dir, "index.html"), "utf8");
    const account = await fs.readFile(path.join(dir, "account", "index.html"), "utf8");
    for (const html of [home, account]) {
      expect(html).toContain(`href="${S3}/u.png"`);
      expect(html).toContain(`media="(prefers-color-scheme: dark)"`);
      expect(html).toContain(`rel="apple-touch-icon"`);
      expect(html).toContain(`rel="manifest" ${FAVICON_MARKER} href="/site.webmanifest"`);
      expect(html.match(/<\/head>/gi)?.length).toBe(1);
    }
    expect(account).not.toContain("/page_logo.svg");

    const manifest = JSON.parse(await fs.readFile(path.join(dir, "site.webmanifest"), "utf8"));
    expect(manifest.name).toBe("Shop");
    expect(manifest.theme_color).toBe("#71c0ff");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("идемпотентность: второй прогон возвращает 0, файлы байт-в-байт", async () => {
    await fs.writeFile(path.join(dir, "index.html"), themeBaseHtml, "utf8");
    await injectFavicons(dir, { favicons: { universal: `${S3}/u.png` } }, {});
    const after1 = await fs.readFile(path.join(dir, "index.html"), "utf8");
    const count2 = await injectFavicons(dir, { favicons: { universal: `${S3}/u.png` } }, {});
    const after2 = await fs.readFile(path.join(dir, "index.html"), "utf8");
    expect(count2).toBe(0);
    expect(after2).toBe(after1);
  });

  it("пустой набор фавиконов → полный noop: HTML не тронут, site.webmanifest не создан", async () => {
    await fs.writeFile(path.join(dir, "index.html"), baseHeadHtml, "utf8");
    const count = await injectFavicons(dir, { favicons: {} }, {});
    expect(count).toBe(0);
    const html = await fs.readFile(path.join(dir, "index.html"), "utf8");
    expect(html).toBe(baseHeadHtml); // дефолт темы /page_logo.svg цел
    await expect(fs.stat(path.join(dir, "site.webmanifest"))).rejects.toBeDefined();
  });
});
