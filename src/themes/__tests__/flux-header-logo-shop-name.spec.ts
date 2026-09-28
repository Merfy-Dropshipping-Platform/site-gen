import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { headerOwnLogo } from "../../../packages/theme-base/runtime/header-logo";

/**
 * Баг владельца 28.09: «лого в Flux не подтягивает название магазина без лого».
 *
 * Замер до правки: магазин владельца (flux, «MrMerfy», логотип не загружен,
 * в ревизии шапки `logo: ''`, `siteTitle: 'MrMerfy'`) — на живой витрине
 * `<img src="/icons/logo-flux.svg" alt="MrMerfy">`: вордмарк темы «ılıl FLUX»
 * вместо названия. С 27.07 (b3bfdbfe, паритет с вёрсткой верстальщиков) порт
 * flux подставлял картинку темы на место пустого логотипа; до этого, как и
 * rose/bloom/satin сейчас, рисовал siteTitle текстом.
 *
 * Рендерим скомпилированный модуль секции (dist/theme-sections/flux) — его же
 * берут и сборка витрины, и превью конструктора.
 */
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SHOP = "Магазин Ромашка";

function renderHeader(props: Record<string, unknown>): string {
  const full = {
    id: "Header-1",
    siteTitle: SHOP,
    colorScheme: "1",
    navigationLinks: [{ label: "Каталог", href: "/catalog" }],
    ...props,
  };
  const out = execFileSync("node", [RENDERER, "flux", JSON.stringify([{ block: "Header", props: full }])], {
    cwd: SITES_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(res.error);
  return res.html ?? "";
}

const LAYOUTS = ["top-left", "top-center", "center-left", "center-absolute"];
// Мобильный ряд + десктопная раскладка — два места логотипа в любой раскладке.
const LOGO_SLOTS = 2;

const textLogos = (html: string) =>
  html.match(new RegExp(`<span[^>]*data-flux-logo-text[^>]*>${SHOP}</span>`, "g")) ?? [];

describe("шапка flux без загруженного логотипа — название магазина", () => {
  it.each(LAYOUTS)("%s: пустой логотип → название текстом, без вордмарка темы", (logoPosition) => {
    const html = renderHeader({ logo: "", logoPosition });
    expect(html).not.toContain("logo-flux.svg");
    expect(textLogos(html)).toHaveLength(LOGO_SLOTS);
  });

  it.each([
    ["плейсхолдер сида", "/logo.svg"],
    ["плейсхолдер, переписанный на домен магазина", "https://abc123.merfy.ru/logo.svg"],
    ["картинка самой темы", "/icons/logo-flux.svg"],
  ])("%s (%s) — не логотип магазина: название текстом", (_label, logo) => {
    const html = renderHeader({ logo, logoPosition: "top-left" });
    expect(html).not.toContain(`src="${logo}"`);
    expect(textLogos(html)).toHaveLength(LOGO_SLOTS);
  });

  it("загруженный логотип рисуется картинкой в обоих местах", () => {
    const logo = "https://minio.merfy.ru/branding/t1/s1/logo-1.png";
    const html = renderHeader({ logo, logoPosition: "top-left" });
    expect(html.split(`src="${logo}"`).length - 1).toBe(LOGO_SLOTS);
    expect(textLogos(html)).toHaveLength(0);
  });

  it("классы текстового логотипа есть в CSS темы (живая сборка их видит)", () => {
    // Ловушка: класс, которого нет в CSS витрины, на живом сайте мёртв.
    const css = readFileSync(resolve(SITES_ROOT, "dist", "theme-css", "flux.css"), "utf8");
    for (const cls of ["truncate", "max-w-\\[calc\\(100vw-15rem\\)\\]", "text-\\[length\\:var\\(--size-logo-width\\,24px\\)\\]"]) {
      expect(css).toContain(`.${cls}`);
    }
  });
});

describe("headerOwnLogo — что считается логотипом магазина", () => {
  it.each([
    [undefined, ""],
    ["", ""],
    ["   ", ""],
    ["/logo.svg", ""],
    ["https://abc.merfy.ru/logo.svg", ""],
    ["/icons/logo-flux.svg", ""],
    ["https://abc.merfy.ru/icons/Bloom.svg", ""],
    ["https://minio.merfy.ru/branding/t/s/logo-1.svg", "https://minio.merfy.ru/branding/t/s/logo-1.svg"],
    [" /uploads/my-logo.png ", "/uploads/my-logo.png"],
  ])("logo=%p → %p", (logo, expected) => {
    expect(headerOwnLogo(logo)).toBe(expected);
  });
});
