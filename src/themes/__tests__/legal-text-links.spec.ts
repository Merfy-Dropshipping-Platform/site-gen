/**
 * Ссылки юридической строки «Спасибо за заказ» и чекаута — ОТКУДА берутся
 * адреса и КАК доезжают до страницы (поведение на разметке пяти тем —
 * legal-text-links.dom.spec.ts).
 *
 *  1. `policyUrlsFor` — одна функция «адреса заполненных политик»: тип →
 *     адрес тем же правилом, что подвал (`/legal/terms`, `/legal/privacy` у
 *     пяти тем, корень у legacy); пусто/пробелы/null — политики нет.
 *     `privacyPolicyUrlFor` (баннер cookie) — поверх неё и не изменился.
 *  2. Превью конструктора ставит глобал `__MERFY_POLICY_URLS__` на всех трёх
 *     путях (блоб, секционный, легаси) — и не ставит без политик.
 *  3. Сборка витрины ставит тот же глобал той же функцией.
 *  3a. Значение глобала не разрывает `<script>` — одна сериализация
 *     (`inlineScriptJson`) у сборки и превью.
 *  4. Таблица фраз — данные: три фразы, cookie → privacy; стандартная строка
 *     панели «Спасибо» и «Условий» совпадает со строкой правила и не несёт
 *     разметки ссылок.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { policyUrlsFor, privacyPolicyUrlFor } from "../../utils/footer-data";
import {
  PreviewController,
  withPolicyUrlsGlobal,
  withPrivacyPolicyGlobal,
} from "../../controllers/preview.controller";
import { injectGlobalsIntoDist } from "../../generator/build.service";
import { inlineScriptJson } from "../../common/inline-script-json";
import type { PreviewService } from "../../services/preview.service";
import {
  DEFAULT_LEGAL_TEXT,
  LEGAL_PHRASES,
  POLICY_URLS_GLOBAL,
  legalLinker,
} from "../../../packages/theme-base/runtime/legal-links";
import { execFileSync } from "node:child_process";

/**
 * Дефолты панели блока — из отдельного процесса tsx, а не импортом: puckConfig
 * тянет типы `@merfy/theme-contract`, которые jest в CI (`CI=true` → проверка
 * типов в jest.config.ts) не находит, и весь файл не загружался («0 проверок»).
 */
const panelDefaults = (file: string, name: string): Record<string, unknown> =>
  JSON.parse(
    execFileSync(
      "pnpm",
      ["exec", "tsx", "-e", `import(${JSON.stringify(resolve(__dirname, "../../..", file))}).then((m) => console.log(JSON.stringify(m.${name}.defaults)))`],
      { encoding: "utf8" },
    ).trim().split("\n").pop() ?? "{}",
  );
import { extractPageBlocks } from "../page-blocks";

jest.mock("../page-blocks", () => ({ extractPageBlocks: jest.fn() }));
const extractPageBlocksMock = extractPageBlocks as jest.MockedFunction<typeof extractPageBlocks>;

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(SITES_ROOT, rel), "utf8");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const ALL_FILLED = [
  { type: "tos", content: "Условия" },
  { type: "privacy", content: "Данные" },
  { type: "refund", content: "Возврат" },
  { type: "shipping", content: "Доставка" },
];

describe("1. адреса заполненных политик — одна функция", () => {
  it.each(THEMES)("%s: все четыре политики → адреса как у подвала", (theme) => {
    expect(policyUrlsFor(ALL_FILLED, theme)).toEqual({
      tos: "/legal/terms",
      privacy: "/legal/privacy",
      refund: "/legal/refund",
      shipping: "/legal/shipping-policy",
    });
  });

  it("пусто, пробелы, null → политики нет в карте", () => {
    expect(
      policyUrlsFor(
        [
          { type: "tos", content: "" },
          { type: "privacy", content: " \n\t " },
          { type: "refund", content: null },
          { type: "shipping", content: "Доставка курьером" },
        ],
        "rose",
      ),
    ).toEqual({ shipping: "/legal/shipping-policy" });
    expect(policyUrlsFor([], "rose")).toEqual({});
  });

  it("legacy-скаффолд кладёт политики в корень", () => {
    expect(policyUrlsFor(ALL_FILLED.slice(0, 2), "luna")).toEqual({ tos: "/terms", privacy: "/privacy" });
  });

  it("баннер cookie: privacyPolicyUrlFor — частный случай, поведение прежнее", () => {
    expect(privacyPolicyUrlFor(ALL_FILLED, "flux")).toBe("/legal/privacy");
    expect(privacyPolicyUrlFor([{ type: "tos", content: "Условия" }], "flux")).toBeNull();
    expect(privacyPolicyUrlFor([{ type: "privacy", content: "  " }], "flux")).toBeNull();
    expect(privacyPolicyUrlFor([{ type: "privacy", content: "Текст" }], "luna")).toBe("/privacy");
  });
});

describe("2. глобал адресов — превью конструктора", () => {
  const SHELL =
    "<!DOCTYPE html><html><head><title>t</title></head><body><main></main><footer></footer></body></html>";
  const globalOf = (html: string): Record<string, string> | null => {
    const m = new RegExp(`window\\.${POLICY_URLS_GLOBAL} = (\\{[^<]*\\});`).exec(html);
    return m ? (JSON.parse(m[1]) as Record<string, string>) : null;
  };

  it("withPolicyUrlsGlobal: карта в <head>, пустая карта — без глобала, `<` экранирован", () => {
    expect(globalOf(withPolicyUrlsGlobal(SHELL, { tos: "/legal/terms" }))).toEqual({ tos: "/legal/terms" });
    expect(withPolicyUrlsGlobal(SHELL, {})).toBe(SHELL);
    expect(withPolicyUrlsGlobal(SHELL, null)).toBe(SHELL);
  });

  function makeRes() {
    const res: any = { _body: undefined as unknown, _headers: {} as Record<string, string> };
    res.status = () => res;
    res.header = (k: string, v: string) => ((res._headers[k] = v), res);
    res.type = () => res;
    res.send = (body: unknown) => ((res._body = body), res);
    return res;
  }

  type Path = "blob" | "v2-sections" | "legacy";
  const PREVIEW_MODE: Record<Path, string | undefined> = {
    blob: "v2-built-theme",
    "v2-sections": "v2-sections",
    legacy: undefined,
  };
  function makeController(policies: Array<{ type: string; content: string }>, path: Path) {
    extractPageBlocksMock.mockReset();
    extractPageBlocksMock.mockResolvedValue([{ type: "Hero", props: { id: "Hero-1" } }] as never);
    const preview = {
      hasV2Sections: jest.fn().mockResolvedValue(path === "v2-sections"),
      renderV2ContentPage: jest.fn().mockResolvedValue(SHELL),
      injectNavAgent: (h: string) => h,
      tryLoadBuiltThemeHtml: jest.fn().mockResolvedValue(path === "blob" ? SHELL : null),
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

  it.each<Path>(["blob", "v2-sections", "legacy"])(
    "путь %s: политики заполнены → глобал с адресами; пустые → глобала нет",
    async (path) => {
      const withPolicy = makeRes();
      await makeController(
        [
          { type: "tos", content: "Условия" },
          { type: "privacy", content: "Данные" },
          { type: "refund", content: "  " },
        ],
        path,
      ).getPreview(`site-${path}-1`, "home", undefined, undefined, withPolicy);
      // Путь действительно тот, что назван (иначе три прогона проверили бы один).
      expect(withPolicy._headers["X-Preview-Mode"]).toBe(PREVIEW_MODE[path]);
      expect(globalOf(String(withPolicy._body))).toEqual({ tos: "/legal/terms", privacy: "/legal/privacy" });

      const noPolicy = makeRes();
      await makeController([{ type: "tos", content: "" }], path).getPreview(
        `site-${path}-2`,
        "home",
        undefined,
        undefined,
        noPolicy,
      );
      expect(String(noPolicy._body)).toContain("<main>");
      expect(String(noPolicy._body)).not.toContain(POLICY_URLS_GLOBAL);
    },
  );
});

describe("3. глобал адресов — сборка витрины", () => {
  it("та же функция, тот же глобал, рядом с глобалом баннера cookie", () => {
    const build = read("src/generator/build.service.ts");
    expect(build).toMatch(/const policyUrls = policyUrlsFor\(sitePolicies, bareTheme\);/);
    expect(build).toMatch(/injectGlobalsIntoDist\(ctx\.distDir, \{ \[POLICY_URLS_GLOBAL\]: policyUrls \}\)/);
    expect(build).toMatch(/sitePolicies = legalPolicies;/);
  });
});

describe("3a. значение глобала не разрывает <script> (сборка и превью)", () => {
  const HOSTILE = '</script><script>window.__pwned=1</script>\u2028';
  const SHELL = "<!DOCTYPE html><html><head><title>t</title></head><body></body></html>";

  /** Скрипты <head> так, как их режет HTML-парсер: по первому `</script>`. */
  const headScripts = (html: string) =>
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  /** Исполнить скрипты в «окне» и вернуть, что они туда положили. */
  function run(html: string): Record<string, unknown> {
    const win: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- ровно то, что исполнит браузер
    headScripts(html).forEach((code) => new Function("window", code)(win));
    return win;
  }

  it("inlineScriptJson: `<` и разрывы строк экранированы, значение то же", () => {
    const json = inlineScriptJson({ k: HOSTILE });
    expect(json).not.toContain("<");
    expect(json).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(json)).toEqual({ k: HOSTILE });
  });

  it("сборка: injectGlobalsIntoDist — один тег, значение доезжает целиком", async () => {
    const dir = mkdtempSync(join(tmpdir(), "legal-globals-"));
    writeFileSync(join(dir, "index.html"), SHELL);
    await injectGlobalsIntoDist(dir, { [POLICY_URLS_GLOBAL]: { tos: HOSTILE }, __MERFY_THEME__: HOSTILE });
    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).not.toContain("<script>window.__pwned");
    expect(headScripts(html)).toHaveLength(1);
    const win = run(html);
    expect(win.__pwned).toBeUndefined();
    expect(win[POLICY_URLS_GLOBAL]).toEqual({ tos: HOSTILE });
    expect(win.__MERFY_THEME__).toBe(HOSTILE);
  });

  it("превью: оба глобала политик — один тег на глобал, значение целиком", () => {
    const html = withPrivacyPolicyGlobal(withPolicyUrlsGlobal(SHELL, { [HOSTILE]: HOSTILE }), HOSTILE);
    expect(html).not.toContain("<script>window.__pwned");
    expect(headScripts(html)).toHaveLength(2);
    const win = run(html);
    expect(win.__pwned).toBeUndefined();
    expect(win[POLICY_URLS_GLOBAL]).toEqual({ [HOSTILE]: HOSTILE });
    expect(win.__MERFY_PRIVACY_POLICY_URL__).toBe(HOSTILE);
  });
});

describe("4. таблица фраз и стандартные строки", () => {
  it("три фразы, cookie ведёт в политику конфиденциальности", () => {
    expect(LEGAL_PHRASES.map((p) => [p.phrase, p.policy])).toEqual([
      ["Условиями обслуживания", "tos"],
      ["Политикой конфиденциальности", "privacy"],
      ["Политикой использования файлов cookie", "privacy"],
    ]);
  });

  it("стандартная строка содержит все фразы и совпадает с дефолтами панели", () => {
    LEGAL_PHRASES.forEach((p) => expect(DEFAULT_LEGAL_TEXT).toContain(p.phrase));
    const orderDefaults = panelDefaults("packages/theme-base/blocks/OrderConfirmation/OrderConfirmation.puckConfig.ts", "OrderConfirmationPuckConfig");
    const termsDefaults = panelDefaults("packages/theme-base/blocks/CheckoutTerms/CheckoutTerms.puckConfig.ts", "CheckoutTermsPuckConfig");
    expect(orderDefaults.legalText).toBe(DEFAULT_LEGAL_TEXT);
    expect(termsDefaults.text).toBe(DEFAULT_LEGAL_TEXT);
    expect(JSON.stringify(termsDefaults)).not.toContain("/legal/");
  });

  it("разбор строки: адрес только у фраз с заполненной политикой, текст не теряется", () => {
    const urls = { privacy: "/legal/privacy" };
    const parts = legalLinker.segments(DEFAULT_LEGAL_TEXT, urls);
    expect(parts.map((p) => p.text).join("")).toBe(DEFAULT_LEGAL_TEXT);
    expect(parts.filter((p) => p.href).map((p) => [p.text, p.href])).toEqual([
      ["Политикой конфиденциальности", "/legal/privacy"],
      ["Политикой использования файлов cookie", "/legal/privacy"],
    ]);
  });

  it("адрес из глобала — только путь своего сайта", () => {
    expect(
      legalLinker.readUrls({
        [POLICY_URLS_GLOBAL]: {
          tos: "javascript:alert(1)",
          privacy: "//evil.example/p",
          refund: "https://evil.example",
          shipping: " /legal/shipping-policy ",
        },
      }),
    ).toEqual({ shipping: "/legal/shipping-policy" });
    expect(legalLinker.readUrls({})).toEqual({});
    expect(legalLinker.readUrls({ [POLICY_URLS_GLOBAL]: "/legal/privacy" })).toEqual({});
  });
});
