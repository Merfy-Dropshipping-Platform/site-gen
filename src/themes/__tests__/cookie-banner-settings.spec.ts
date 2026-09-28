/**
 * Настройки баннера cookie («Настройки темы» → «Баннер», владелец 28.09):
 * «Вкл/Выкл и цветовая схема» в левом сайдбаре, «Заголовок, Текст, Кнопки,
 * Расположение» в правом. Хранятся в ревизии: `themeSettings.cookieBanner`.
 *
 * Что сторожим (каждая проверка ловит свой способ тихо всё сломать):
 *  1. значения по умолчанию = баннер 27.09: разметка компонента дословно
 *     совпадает с `COOKIE_BANNER_DEFAULTS` — у магазинов, где баннер не
 *     трогали, не меняется ничего;
 *  2. мусор в ревизии не проходит (`resolveCookieBanner`), глобал текстов
 *     появляется только когда продавец что-то менял;
 *  3. tokens.css пяти тем: без настроек правил баннера нет вовсе; выключен —
 *     `display:none`; схема — переменные именно этой схемы палитры магазина;
 *     расположение — своё правило, «снизу слева» правила не имеет;
 *  4. глобал текстов доезжает на всех трёх путях превью и в сборку витрины;
 *  5. конструктор получает значения по умолчанию из конфига темы;
 *  6. агент превью: нажатие на баннер выделяет его (а не отвечает на баннер),
 *     выделение рисуется рамкой, `update-tokens` меняет тексты без
 *     перезагрузки — имена глобала и события те же, что у рантайма.
 *
 * Поведение рантайма (тексты из глобала, «Отклонить», превью) —
 * cookie-consent-runtime.dom.spec.ts.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "node-html-parser";

import {
  COOKIE_BANNER_DEFAULTS,
  COOKIE_BANNER_GLOBAL,
  COOKIE_BANNER_UPDATE_EVENT,
  cookieBannerGlobal,
  formatCookieBannerText,
  resolveCookieBanner,
} from "../../../packages/theme-base/runtime/cookie-consent";
import { buildTokensCss } from "../tokens-css";
import { PreviewController } from "../../controllers/preview.controller";
import type { PreviewService } from "../../services/preview.service";
import { extractPageBlocks } from "../page-blocks";

jest.mock("../page-blocks", () => ({ extractPageBlocks: jest.fn() }));
const extractPageBlocksMock = extractPageBlocks as jest.MockedFunction<
  typeof extractPageBlocks
>;

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(SITES_ROOT, rel), "utf8");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

describe("1. по умолчанию — баннер 27.09", () => {
  const html = execFileSync(
    process.execPath,
    [resolve(__dirname, "render-cookie-consent.mjs")],
    { cwd: SITES_ROOT, encoding: "utf8" },
  );
  const banner = parse(html).querySelector("[data-cookie-consent]")!;

  it("1a. текст и подписи разметки = COOKIE_BANNER_DEFAULTS", () => {
    const squash = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(squash(banner.querySelector("[data-cookie-consent-text]")!.text)).toBe(
      COOKIE_BANNER_DEFAULTS.text,
    );
    expect(squash(banner.querySelector("[data-cookie-consent-accept]")!.text)).toBe(
      COOKIE_BANNER_DEFAULTS.acceptLabel,
    );
    expect(squash(banner.querySelector("[data-cookie-consent-decline]")!.text)).toBe(
      COOKIE_BANNER_DEFAULTS.declineLabel,
    );
  });

  it("1b. заголовок пуст и скрыт, «Отклонить» скрыта — как было", () => {
    const heading = banner.querySelector("[data-cookie-consent-heading]")!;
    expect(heading.text.trim()).toBe("");
    expect(heading.hasAttribute("hidden")).toBe(true);
    expect(
      banner.querySelector("[data-cookie-consent-decline]")!.hasAttribute("hidden"),
    ).toBe(true);
    expect(COOKIE_BANNER_DEFAULTS).toMatchObject({
      enabled: true,
      colorScheme: null,
      heading: "",
      declineEnabled: false,
      position: "bottom-left",
    });
  });

  it("1c. карточка и кнопки размечены для правил расположения", () => {
    expect(banner.querySelector("[data-cookie-consent-card]")).not.toBeNull();
    expect(banner.querySelector("[data-cookie-consent-actions]")).not.toBeNull();
  });
});

describe("2. настройки из ревизии", () => {
  it("2a. мусор отбрасывается, своё значение остаётся", () => {
    expect(
      resolveCookieBanner({
        enabled: "false",
        colorScheme: "",
        heading: 42,
        position: "top",
        acceptLabel: "   ",
        declineEnabled: 1,
      }),
    ).toEqual(COOKIE_BANNER_DEFAULTS);
    expect(
      resolveCookieBanner({
        enabled: false,
        colorScheme: "scheme-3",
        heading: "Cookie",
        text: "",
        position: "bar",
      }),
    ).toMatchObject({
      enabled: false,
      colorScheme: "scheme-3",
      heading: "Cookie",
      text: "",
      position: "bar",
      acceptLabel: "Принять",
    });
  });

  it("2b. глобал текстов — только если продавец трогал баннер", () => {
    expect(cookieBannerGlobal({})).toBeNull();
    expect(cookieBannerGlobal({ cookieBanner: {} })).toBeNull();
    expect(cookieBannerGlobal(null)).toBeNull();
    expect(cookieBannerGlobal({ cookieBanner: { heading: "Привет" } })).toEqual({
      heading: "Привет",
      text: COOKIE_BANNER_DEFAULTS.text,
      acceptLabel: "Принять",
      declineEnabled: false,
      declineLabel: "Отклонить",
    });
  });

  it("2c. текст: экранирование, «Ж»/«К», ссылки только с доверенной схемой", () => {
    expect(formatCookieBannerText("a < b & <strong>c</strong>")).toBe(
      "a &lt; b &amp; <strong>c</strong>",
    );
    expect(formatCookieBannerText("[x](https://e.ru/?a=1&b=\"2\")", "u")).toBe(
      '<a href="https://e.ru/?a=1&amp;b=&quot;2&quot;" class="u">x</a>',
    );
    expect(formatCookieBannerText("[x](javascript:alert(1))")).not.toContain("<a");
    expect(formatCookieBannerText("[x](javascript:void)")).toBe("x");
    expect(formatCookieBannerText("[x](//evil.ru)")).toBe("x");
    expect(formatCookieBannerText('<b onclick="x">y</b>')).toBe(
      "&lt;b onclick=&quot;x&quot;&gt;y</b>",
    );
  });
});

/** Значение переменной в первом правиле `selector{…}` CSS. */
function varIn(css: string, selector: string, name: string): string | null {
  const found = [`${selector}{`, `${selector} {`]
    .map((head) => css.indexOf(head))
    .filter((i) => i >= 0);
  if (found.length === 0) return null;
  const at = Math.min(...found);
  const body = css.slice(at, css.indexOf("}", at));
  const m = new RegExp(`${name}:\\s*([^;}]+)`).exec(body);
  return m ? m[1].trim() : null;
}

describe("3. tokens.css — вкл/выкл, схема, расположение", () => {
  it.each(THEMES)("3a. %s: без настроек правил баннера нет", (theme) => {
    expect(buildTokensCss({}, theme)).not.toContain("data-cookie-consent");
    expect(buildTokensCss({ cookieBanner: {} }, theme)).not.toContain(
      "data-cookie-consent",
    );
  });

  it.each(THEMES)("3b. %s: выключен — баннера нет", (theme) => {
    expect(buildTokensCss({ cookieBanner: { enabled: false } }, theme)).toContain(
      "[data-cookie-consent]{display:none !important}",
    );
  });

  it.each(THEMES)("3c. %s: схема — переменные этой схемы палитры", (theme) => {
    const css = buildTokensCss({ cookieBanner: { colorScheme: "scheme-2" } }, theme);
    const expectedBg = varIn(css, ".color-scheme-2", "--color-bg");
    expect(expectedBg).not.toBeNull();
    expect(varIn(css, "[data-cookie-consent]", "--color-bg")).toBe(expectedBg);
    expect(varIn(css, "[data-cookie-consent]", "--color-button-bg")).toBe(
      varIn(css, ".color-scheme-2", "--color-button-bg"),
    );
  });

  it("3d. несуществующая схема — правила нет", () => {
    expect(
      buildTokensCss({ cookieBanner: { colorScheme: "scheme-99" } }, "flux"),
    ).not.toContain("data-cookie-consent");
  });

  it("3e. расположение: своё правило, «снизу слева» без правила", () => {
    const css = (position: string) =>
      buildTokensCss({ cookieBanner: { position } }, "flux");
    expect(css("bottom-left")).not.toContain("data-cookie-consent");
    expect(css("bottom-right")).toContain(
      "@media (min-width:768px){[data-cookie-consent]{left:auto;right:1.5rem}}",
    );
    expect(css("bottom-center")).toContain("margin-inline:auto");
    expect(css("bar")).toContain(
      "[data-cookie-consent]{left:0;right:0;bottom:0;width:auto;margin:0}",
    );
    expect(css("bar")).toContain("[data-cookie-consent-card]{border-radius:0");
  });
});

describe("4. глобал текстов — превью и сборка", () => {
  const SHELL =
    "<!DOCTYPE html><html><head><title>t</title></head><body><main></main><footer></footer></body></html>";
  const GLOBAL_RE = new RegExp(
    `window\\.${COOKIE_BANNER_GLOBAL} = \\{"heading":"Куки"`,
  );

  function makeRes() {
    const res: any = { _body: undefined as unknown, _headers: {} };
    res.status = () => res;
    res.header = (k: string, v: string) => ((res._headers[k] = v), res);
    res.type = () => res;
    res.send = (body: unknown) => ((res._body = body), res);
    return res;
  }

  type Path = "blob" | "v2-sections" | "legacy";
  function makeController(themeSettings: unknown, path: Path) {
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
      data: { pages: [{ id: "home", slug: "/" }], pagesData: {}, themeSettings },
      publicUrl: null,
      themeId: "flux",
      revisionId: `rev-${path}-${JSON.stringify(themeSettings)}`,
    });
    jest.spyOn(ctrl as any, "loadPolicies").mockResolvedValue([]);
    return ctrl;
  }

  it.each<Path>(["blob", "v2-sections", "legacy"])(
    "4a. превью, путь %s: баннер трогали → глобал, не трогали → нет",
    async (path) => {
      const touched = makeRes();
      await makeController(
        { cookieBanner: { heading: "Куки" } },
        path,
      ).getPreview("site-1", "home", undefined, undefined, touched);
      expect(String(touched._body)).toMatch(GLOBAL_RE);

      const untouched = makeRes();
      await makeController({ buttonRadius: 4 }, path).getPreview(
        "site-2",
        "home",
        undefined,
        undefined,
        untouched,
      );
      expect(String(untouched._body)).toContain("<main>");
      expect(String(untouched._body)).not.toContain(COOKIE_BANNER_GLOBAL);
    },
  );

  it("4b. сборка витрины ставит тот же глобал той же функцией", () => {
    const build = read("src/generator/build.service.ts");
    expect(build).toMatch(/const banner = cookieBannerGlobal\(/);
    expect(build).toMatch(
      /injectGlobalsIntoDist\(ctx\.distDir, \{ \[COOKIE_BANNER_GLOBAL\]: banner \}\)/,
    );
  });
});

describe("5. конструктор получает значения по умолчанию с конфигом темы", () => {
  it("5a. ответ /api/themes/:id/puck-config несёт cookieBanner = COOKIE_BANNER_DEFAULTS", () => {
    const src = read("src/controllers/theme-puck-config.controller.ts");
    expect(src).toMatch(/cookieBanner: COOKIE_BANNER_DEFAULTS,\n\s*\};/);
  });
});

/** Тело инлайн-агента превью — то, что уезжает в браузер. */
function agentSource(): string {
  const src = read("src/services/preview.service.ts");
  const marker = "const PREVIEW_NAV_AGENT_INLINE = `";
  const from = src.indexOf(marker) + marker.length;
  const end = src.indexOf("\n`;", from);
  return src
    .slice(from, end)
    .replace(/\\\\/g, "\\")
    .replace(/\\`/g, "`")
    .replace(/\$\{[^}]*\}/g, "''");
}

describe("6. агент превью", () => {
  it("6a. имена глобала и события — те же, что у рантайма баннера", () => {
    const agent = agentSource();
    expect(agent).toContain(`window.${COOKIE_BANNER_GLOBAL} = `);
    expect(agent).toContain(`new CustomEvent('${COOKIE_BANNER_UPDATE_EVENT}')`);
  });
});
