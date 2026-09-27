/**
 * Баннер согласия на cookie — одна разметка и одно правило ссылки на политику
 * для всех пяти тем (владелец 27.09: «как обычно делают», со ссылкой на
 * политику конфиденциальности магазина; политики нет — ссылки нет).
 *
 * Что сторожим (каждая проверка ловит свой способ тихо всё сломать):
 *  1. разметка, которую реально рисует компонент (компилятор Astro +
 *     Container API): область с подписью, кнопка «Принять» — настоящая
 *     кнопка, баннер и фраза со ссылкой приходят СКРЫТЫМИ, у ссылки нет адреса
 *     «по умолчанию» — иначе без глобала она вела бы на демо-текст темы;
 *  2. внутри баннера нет тега footer: composeV2Page режет шелл по последнему
 *     `</footer>`, и баннер с подвалом внутри съел бы страницу;
 *  3. каждая из пяти тем монтирует ОБЩИЙ компонент ПОСЛЕ подвала (иначе
 *     сборка страниц из секций его срежет) и вне условия «не чекаут»;
 *  4. у собранной витрины satin (CI собирает её честно) баннер стоит после
 *     последнего `</footer>` и его скрипт попал в бандл;
 *  5. правило «политика есть»: type privacy + непустой content → адрес по
 *     тому же правилу, что ссылка подвала (/legal/privacy у пяти тем); пусто,
 *     пробелы, null, нет записи → null;
 *  6. превью конструктора ставит глобал только при политике — и на
 *     секционном, и на блоб-пути; сборка витрины зовёт ту же функцию.
 *
 * Поведение (показ, «Принять», хранилище, ссылка по глобалу) — в
 * cookie-consent-runtime.dom.spec.ts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse } from "node-html-parser";

import { privacyPolicyUrlFor } from "../../utils/footer-data";
import { composeV2Page } from "../v2-page-composer";
import { PreviewController } from "../../controllers/preview.controller";
import type { PreviewService } from "../../services/preview.service";
import { PRIVACY_POLICY_URL_GLOBAL } from "../../../packages/theme-base/runtime/cookie-consent";
import { extractPageBlocks } from "../page-blocks";

// Блоки страницы для секционного и легаси-путей превью подставляет тест —
// проверяется доставка глобала, а не разбор ревизии.
jest.mock("../page-blocks", () => ({ extractPageBlocks: jest.fn() }));
const extractPageBlocksMock = extractPageBlocks as jest.MockedFunction<
  typeof extractPageBlocks
>;

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(SITES_ROOT, rel), "utf8");
const RENDERER = resolve(__dirname, "render-cookie-consent.mjs");

const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
/** Убрать комментарии (JSX-комментарии, блочные, строчные, фронтматтер) — сканируем КОД. */
function stripComments(src: string): string {
  return src
    .replace(/^---[\s\S]*?---/, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const html = execFileSync(process.execPath, [RENDERER], {
  cwd: SITES_ROOT,
  encoding: "utf8",
});
const dom = parse(html);
const banner = dom.querySelector("[data-cookie-consent]");

describe("баннер cookie — разметка (рендер компонента)", () => {
  it("1a. область с подписью, скрыта до решения рантайма", () => {
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("role")).toBe("region");
    expect(banner!.getAttribute("aria-label")).toBe("Согласие на cookie");
    expect(banner!.hasAttribute("hidden")).toBe(true);
    // Фиксированный блок внизу, без затемняющей подложки на весь экран.
    expect(banner!.getAttribute("class")).toMatch(/\bfixed\b/);
    expect(banner!.getAttribute("class")).toMatch(/\bbottom-4\b/);
    expect(banner!.getAttribute("class")).not.toMatch(/\binset-0\b/);
  });

  it("1b. текст согласия — дословно", () => {
    const text = banner!.querySelector("p")!.text.replace(/\s+/g, " ").trim();
    expect(
      text.startsWith(
        "Мы используем файлы cookie, чтобы сайт работал корректно. Продолжая пользоваться сайтом, вы соглашаетесь с их использованием.",
      ),
    ).toBe(true);
  });

  it("1c. «Принять» — настоящая кнопка type=button", () => {
    const button = banner!.querySelector("button[data-cookie-consent-accept]");
    expect(button).not.toBeNull();
    expect(button!.getAttribute("type")).toBe("button");
    expect(button!.text.trim()).toBe("Принять");
  });

  it("1d. фраза со ссылкой скрыта, у ссылки нет адреса без глобала", () => {
    const slot = banner!.querySelector("[data-cookie-consent-policy]");
    expect(slot).not.toBeNull();
    expect(slot!.hasAttribute("hidden")).toBe(true);
    expect(slot!.text.replace(/\s+/g, " ")).toBe(
      " Подробнее — в Политике конфиденциальности.",
    );
    const link = slot!.querySelector("a[data-cookie-consent-policy-link]");
    expect(link).not.toBeNull();
    expect(link!.hasAttribute("href")).toBe(false);
    // Ни одной ссылки на демо-страницы темы.
    expect(html).not.toMatch(/href="[^"]*legal/);
  });

  it("1e. цвета — только токены темы и схемы, без литералов", () => {
    const classes = banner!
      .querySelectorAll("[class]")
      .map((n) => n.getAttribute("class"))
      .join(" ");
    expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(classes).not.toMatch(/rgb\(\d/);
    for (const token of [
      "--color-bg",
      "--color-text",
      "--color-button-bg",
      "--color-button-text",
      "--font-body",
      "--radius-button",
    ]) {
      expect(classes).toContain(token);
    }
  });

  it("2. внутри баннера нет тега footer", () => {
    expect(html).not.toMatch(/<\/?footer\b/i);
  });
});

describe("баннер cookie — подключён в пяти темах", () => {
  /**
   * Витринные документы темы: каждый макет `src/layouts/*.astro` и каждая
   * страница со СВОИМ `<html>` и витринной шапкой или подвалом (стартовый
   * `blog/index.astro` — отдельный документ, не общий Layout). Служебные
   * страницы без шапки и подвала (`puck-editor`, `design-system` rose,
   * auth-редиректы satin/bloom) под правило не попадают.
   */
  function storefrontDocuments(theme: string): string[] {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return name.endsWith(".astro") ? [full] : [];
      });
    const src = resolve(SITES_ROOT, "themes", theme, "src");
    const layouts = walk(join(src, "layouts"));
    const pages = walk(join(src, "pages")).filter((file) => {
      const code = stripComments(readFileSync(file, "utf8"));
      return /<html\b/.test(code) && /<(Header|Footer)\b/.test(code);
    });
    return [...layouts, ...pages].map((f) => relative(SITES_ROOT, f)).sort();
  }

  /** Где стоит баннер: сам компонент или рантайм rose, который его несёт. */
  const MOUNT_TAG = /^\s*<(CookieConsent|StorefrontRuntime) \/>\s*$/m;

  it.each(THEMES)(
    "3. %s: баннер во ВСЕХ витринных макетах и страницах, после подвала, вне условия «не чекаут»",
    (theme) => {
      const docs = storefrontDocuments(theme);
      expect(docs.length).toBeGreaterThanOrEqual(3);
      const missing = docs.filter((doc) => {
        const code = stripComments(read(doc));
        const mount = MOUNT_TAG.exec(code);
        return !mount || mount.index < code.lastIndexOf("<Footer");
      });
      expect(missing).toEqual([]);
    },
  );

  it("3a. рантайм rose несёт общий компонент, остальные темы — импорт компонента", () => {
    const rose = read("themes/rose/src/components/StorefrontRuntime.astro");
    expect(rose).toMatch(
      /import CookieConsent from "[^"]*packages\/theme-base\/primitives\/CookieConsent\.astro";/,
    );
    expect(stripComments(rose)).toMatch(/^\s*<CookieConsent \/>\s*$/m);
    for (const theme of THEMES.filter((t) => t !== "rose")) {
      for (const doc of storefrontDocuments(theme)) {
        expect([doc, read(doc)]).toEqual([
          doc,
          expect.stringMatching(
            /import CookieConsent from ["'][^"']*packages\/theme-base\/primitives\/CookieConsent\.astro["'];/,
          ),
        ]);
      }
    }
  });

  it("3c. саботаж: документ без баннера сторож ловит", () => {
    const code = stripComments(
      read("themes/flux/src/layouts/BlogPost.astro").replace(
        /\s*<CookieConsent \/>/,
        "",
      ),
    );
    expect(MOUNT_TAG.test(code)).toBe(false);
  });

  it("3b. рантайм баннера подключён самим компонентом (обрабатываемый скрипт)", () => {
    const src = read("packages/theme-base/primitives/CookieConsent.astro");
    expect(src).toMatch(
      /<script>\s*[\s\S]*import \{ initCookieConsent \} from "\.\.\/runtime\/cookie-consent";\s*initCookieConsent\(\);/,
    );
  });

  const satinLive = resolve(SITES_ROOT, "dist/theme-live/satin/index.html");
  const satinIt = existsSync(satinLive) ? it : it.skip;
  satinIt(
    "4. собранная витрина satin: баннер после последнего </footer>, скрипт в бандле",
    () => {
      const page = readFileSync(satinLive, "utf8");
      const at = page.indexOf("data-cookie-consent");
      expect(at).toBeGreaterThan(page.lastIndexOf("</footer>"));
      // Обрабатываемый скрипт компонента собран Vite в модуль витрины.
      const scripts = [
        ...page.matchAll(/<script type="module" src="([^"]+)"/g),
      ].map((m) => m[1]);
      const bundled =
        scripts.some((src) => {
          const file = resolve(
            SITES_ROOT,
            "dist/theme-live/satin",
            `.${src.replace(/^\/+/, "/")}`,
          );
          return (
            existsSync(file) &&
            readFileSync(file, "utf8").includes("merfy:cookie-consent:v1")
          );
        }) || page.includes("merfy:cookie-consent:v1");
      expect(bundled).toBe(true);
      // Сборка страницы из секций (витрина и превью) берёт этот же шелл и
      // заменяет тело до последнего </footer> — баннер обязан уцелеть.
      const composed = composeV2Page({
        shellHtml: page,
        blocksHtml: ["<section>секция</section>"],
        blockTypes: ["Hero"],
        assetPrefix: null,
      });
      expect(composed).not.toBeNull();
      expect(composed).toContain("<section>секция</section>");
      expect(composed!.match(/data-cookie-consent(?=[\s>])/g)).toHaveLength(1);
    },
  );
});

describe("признак «политика есть» — одно правило", () => {
  const privacy = (content: string | null) => [{ type: "privacy", content }];

  it.each(THEMES)(
    "5a. %s: написанная политика → /legal/privacy (как ссылка подвала)",
    (theme) => {
      expect(
        privacyPolicyUrlFor(privacy("Мы бережём ваши данные."), theme),
      ).toBe("/legal/privacy");
    },
  );

  it("5b. пусто, пробелы, null, нет записи, другие политики → null", () => {
    expect(privacyPolicyUrlFor(privacy(""), "rose")).toBeNull();
    expect(privacyPolicyUrlFor(privacy("  \n\t "), "rose")).toBeNull();
    expect(privacyPolicyUrlFor(privacy(null), "rose")).toBeNull();
    expect(privacyPolicyUrlFor([], "rose")).toBeNull();
    expect(
      privacyPolicyUrlFor(
        [{ type: "refund", content: "Возврат 14 дней" }],
        "rose",
      ),
    ).toBeNull();
  });

  it("5c. legacy-скаффолд кладёт политику в корень — /privacy", () => {
    expect(privacyPolicyUrlFor(privacy("Текст"), "luna")).toBe("/privacy");
  });
});

describe("глобал политики — превью и сборка", () => {
  const SHELL =
    "<!DOCTYPE html><html><head><title>t</title></head><body><main></main><footer></footer></body></html>";
  const GLOBAL_RE = new RegExp(
    `window\\.${PRIVACY_POLICY_URL_GLOBAL} = "/legal/privacy"`,
  );

  function makeRes() {
    const res: any = {
      _body: undefined as unknown,
      _headers: {} as Record<string, string>,
    };
    res.status = () => res;
    res.header = (k: string, v: string) => ((res._headers[k] = v), res);
    res.type = () => res;
    res.send = (body: unknown) => ((res._body = body), res);
    return res;
  }

  type Path = "blob" | "v2-sections" | "legacy";
  function makeController(
    policies: Array<{ type: string; content: string }>,
    path: Path = "blob",
  ) {
    extractPageBlocksMock.mockReset();
    extractPageBlocksMock.mockResolvedValue([
      { type: "Hero", props: { id: "Hero-1" } },
    ] as never);
    const preview = {
      hasV2Sections: jest.fn().mockResolvedValue(path === "v2-sections"),
      renderV2ContentPage: jest.fn().mockResolvedValue(SHELL),
      injectNavAgent: (h: string) => h,
      tryLoadBuiltThemeHtml: jest
        .fn()
        .mockResolvedValue(path === "blob" ? SHELL : null),
      renderPreviewPage: jest.fn().mockResolvedValue(SHELL),
      firstBuiltProductRoute: jest.fn(),
      renderBlock: jest.fn().mockResolvedValue(""),
    } as unknown as PreviewService;
    const ctrl = new PreviewController(
      preview,
      {} as never,
      { send: jest.fn(), emit: jest.fn() } as never,
      { send: jest.fn(), emit: jest.fn() } as never,
    );
    jest.spyOn(ctrl as any, "loadRevisionData").mockResolvedValue({
      data: { pages: [{ id: "home", slug: "/" }], pagesData: {} },
      publicUrl: null,
      themeId: "flux",
      revisionId: "rev-1",
    });
    jest.spyOn(ctrl as any, "loadPolicies").mockResolvedValue(policies);
    return ctrl;
  }

  it("6a. превью (блоб-путь): политика написана → глобал с адресом", async () => {
    const res = makeRes();
    await makeController([
      { type: "privacy", content: "Текст политики" },
    ]).getPreview("site-1", "home", undefined, undefined, res);
    expect(String(res._body)).toMatch(GLOBAL_RE);
  });

  it("6b. превью: политика пустая → глобала нет", async () => {
    const res = makeRes();
    await makeController([{ type: "privacy", content: "   " }]).getPreview(
      "site-1",
      "home",
      undefined,
      undefined,
      res,
    );
    expect(String(res._body)).toContain("<main>");
    expect(String(res._body)).not.toContain(PRIVACY_POLICY_URL_GLOBAL);
  });

  it.each<Path>(["v2-sections", "legacy"])(
    "6c. превью, путь %s: политика написана → глобал с адресом, пустая → глобала нет",
    async (path) => {
      const withPolicy = makeRes();
      await makeController(
        [{ type: "privacy", content: "Текст политики" }],
        path,
      ).getPreview("site-1", "home", undefined, undefined, withPolicy);
      expect(withPolicy._headers["X-Preview-Mode"]).toBe(
        path === "v2-sections" ? "v2-sections" : undefined,
      );
      expect(String(withPolicy._body)).toMatch(GLOBAL_RE);

      const noPolicy = makeRes();
      await makeController([{ type: "privacy", content: "" }], path).getPreview(
        "site-2",
        "home",
        undefined,
        undefined,
        noPolicy,
      );
      expect(String(noPolicy._body)).toContain("<main>");
      expect(String(noPolicy._body)).not.toContain(PRIVACY_POLICY_URL_GLOBAL);
    },
  );

  it("6d. сборка витрины ставит тот же глобал той же функцией", () => {
    const build = read("src/generator/build.service.ts");
    expect(build).toMatch(
      /const privacyUrl = privacyPolicyUrlFor\(sitePolicies, bareTheme\);/,
    );
    expect(build).toMatch(
      /injectGlobalsIntoDist\(ctx\.distDir, \{ \[PRIVACY_POLICY_URL_GLOBAL\]: privacyUrl \}\)/,
    );
    expect(build).toMatch(/sitePolicies = legalPolicies;/);
  });
});

describe("баннер в синтетическом шелле превью (легаси-путь)", () => {
  /**
   * Легаси-путь превью (`renderPreviewPage`) достижим у пяти тем: у маршрута
   * нет собранной страницы превью темы, а секционный путь не дал страницу
   * (сложный маршрут, сбой, пустые блоки). Шелла темы с баннером там нет —
   * баннер дорисовывает сам шелл тем же компонентом (скомпилирован
   * `build:blocks`) и тем же рантаймом.
   */
  const compiled = resolve(
    SITES_ROOT,
    "dist/astro-blocks/theme-base__primitives__CookieConsent.mjs",
  );
  const shellIt = existsSync(compiled) ? it : it.skip;

  shellIt(
    "7. баннер и рантайм в шелле, без ссылки на скрипт Vite",
    async () => {
      // Настоящий сервис с контейнером по умолчанию — в дочернем процессе
      // (в jest контейнер Astro и dist/astro-blocks не грузятся).
      const html = execFileSync(
        resolve(SITES_ROOT, "node_modules/.bin/tsx"),
        [resolve(__dirname, "render-preview-shell.mjs"), "flux"],
        { cwd: SITES_ROOT, encoding: "utf8" },
      );
      const body = parse(html).querySelector("body")!;
      const shellBanner = body.querySelector("[data-cookie-consent]");
      expect(shellBanner).not.toBeNull();
      expect(shellBanner!.hasAttribute("hidden")).toBe(true);
      expect(
        shellBanner!.querySelector("button[data-cookie-consent-accept]"),
      ).not.toBeNull();
      expect(html).not.toMatch(/\?astro&(amp;)?type=script/);
      const inline = body
        .querySelectorAll('script[type="module"]')
        .map((n) => n.text)
        .find((code) => code.includes("merfy:cookie-consent:v1"));
      expect(inline).toBeDefined();
      expect(inline!.trim().endsWith("initCookieConsent();")).toBe(true);
    },
  );
});
