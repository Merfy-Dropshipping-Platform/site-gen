/**
 * MAX в подвале витрины — пять тем.
 *
 * Владелец, 14.09 (дословно): «В настройках темы во вкладке Социальные сети
 * добавить пункт и живность MAX, то есть надо ещё добавить иконку макс
 * мессенджера».
 *
 * Замер «до» (grep по themes/<t>/src/components/Footer.astro и
 * packages/theme-base/blocks/Footer/Footer.astro): карты платформ знали ровно
 * пять ключей — telegram, vk, dzen/yandex-dzen, youtube, tiktok. Ссылка с
 * `platform: 'max'` из панели темы отбрасывалась ФИЛЬТРОМ карты (`meta &&
 * href` → null), то есть на витрине не появлялось даже пустого места.
 *
 * Соцсети — форк-архитектура: рендер иконки у каждой темы свой (rose — инлайн
 * SVG из ROSE_ICON_SVGS, vanilla — .astro-обёртки над белыми файлами, flux —
 * FluxNtIcon, satin — SatinNtIcon, bloom — SocialIcon), общего кода нет.
 * Поэтому сторожим не код, а РЕЗУЛЬТАТ: каждый порт рендерит ссылку и
 * непустую иконку, и все карты знают ОДИН набор платформ. Добавят сеть в
 * панель конструктора, забыв тему, — падает этот тест, а не тестировщик.
 *
 * Требует собранных секций: pnpm build:theme-sections <тема> для всех пяти.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Ключи платформ = `platform` в socialColumn.socialLinks (конструктор). */
const PLATFORM_KEYS = ["telegram", "vk", "dzen", "youtube", "tiktok", "max"];

const SOCIAL_LINKS = [
  { platform: "telegram", href: "https://t.me/merfyshop" },
  { platform: "max", href: "https://max.ru/merfyshop" },
];

const footerJob = {
  block: "Footer",
  props: {
    id: "Footer-1",
    colorScheme: "1",
    padding: { top: 40, bottom: 40 },
    socialColumn: {
      title: "Социальные сети",
      email: "shop@example.ru",
      socialLinks: SOCIAL_LINKS,
    },
  },
};

function renderFooter(theme: string): string {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify([footerJob])], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as {
    block: string;
    html?: string;
    missing?: boolean;
    error?: string;
  }[];
  const row = rows[0];
  if (row?.error) throw new Error(`рендер ${theme}: ${row.error}`);
  return row?.html ?? "";
}

/** Разметка ссылки соцсети: <a href=…> целиком, включая иконку внутри. */
function anchorFor(html: string, href: string): string | null {
  const idx = html.indexOf(href);
  if (idx < 0) return null;
  const start = html.lastIndexOf("<a", idx);
  const end = html.indexOf("</a>", idx);
  if (start < 0 || end < 0) return null;
  return html.slice(start, end + 4);
}

/** Иконка «есть»: инлайн-<svg> с фигурой или <img> на файл иконки. */
function hasGlyph(anchor: string): boolean {
  const inlineSvg = /<svg[\s\S]*?<(path|circle|rect|polygon)/i.test(anchor);
  const imgFile = /<img[^>]+src="[^"]*social-max[^"]*\.svg"/i.test(anchor);
  return inlineSvg || imgFile;
}

describe("карты платформ знают один набор соцсетей", () => {
  const sources: Array<[string, string]> = [
    [
      "theme-base",
      resolve(SITES_ROOT, "packages/theme-base/blocks/Footer/Footer.astro"),
    ],
    ...THEMES.map(
      (t) =>
        [t, resolve(SITES_ROOT, `themes/${t}/src/components/Footer.astro`)] as [
          string,
          string,
        ],
    ),
  ];

  it.each(sources)("%s: карта платформ содержит все ключи панели", (_name, file) => {
    const code = readFileSync(file, "utf-8");
    // Карта — это `SOCIAL_ICONS` (theme-base) или `SOCIAL_PLATFORMS` (порты тем);
    // берём её тело, чтобы не ловить совпадения из соседнего кода.
    const map = code.match(
      /const\s+(SOCIAL_ICONS|SOCIAL_PLATFORMS)[^=]*=\s*\{([\s\S]*?)\n\};/,
    );
    if (!map) throw new Error(`в ${file} не найдена карта платформ`);
    const body = map[2];
    const missing = PLATFORM_KEYS.filter(
      (key) => !new RegExp(`(^|\\n)\\s*["']?${key}["']?\\s*:`).test(body),
    );
    expect(missing).toEqual([]);
  });
});

describe.each(THEMES)("подвал %s: MAX доезжает до витрины", (theme) => {
  const manifest = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    theme,
    "manifest.json",
  );
  const built = existsSync(manifest);
  let html = "";

  beforeAll(() => {
    if (built) html = renderFooter(theme);
  }, 120_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  it("ссылка MAX есть в разметке", () => {
    if (!built) return;
    expect(html).toContain("https://max.ru/merfyshop");
  });

  it("у MAX нарисована иконка, а не пустое место", () => {
    if (!built) return;
    const anchor = anchorFor(html, "https://max.ru/merfyshop");
    if (!anchor) throw new Error("ссылка MAX не обёрнута в <a>");
    // Пустая <svg> без фигуры внутри = «место есть, иконки нет».
    expect(hasGlyph(anchor) ? "иконка есть" : `иконка пустая: ${anchor}`).toBe(
      "иконка есть",
    );
  });

  it("соседние соцсети не пострадали (telegram на месте)", () => {
    if (!built) return;
    const anchor = anchorFor(html, "https://t.me/merfyshop");
    if (!anchor) throw new Error("ссылка telegram пропала");
    const ok =
      /<svg[\s\S]*?<(path|circle|rect|polygon)/i.test(anchor) ||
      /<img[^>]+src="[^"]*social-telegram[^"]*\.svg"/i.test(anchor);
    expect(ok ? "иконка есть" : `иконка пустая: ${anchor}`).toBe("иконка есть");
  });
});
