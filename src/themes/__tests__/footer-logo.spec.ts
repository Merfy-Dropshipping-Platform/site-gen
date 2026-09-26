/**
 * «Логотип» в секции «Подвал» — своё поле загрузки, как у логотипа шапки.
 *
 * Откуда. Владелец 26.09: «Логотип меняется в хедере, а в подвале я не могу,
 * там стандартный логотип темы стоит. Добавь в футер такую же секцию, чтобы
 * можно было там менять логотип». Шапка берёт логотип из «Настроек темы →
 * Логотип» (поле загрузки, «Макс. размер 500 КБ»), а у подвала поля не было
 * ни в одной из пяти тем; vanilla рисовала в подвале вордмарк темы всегда.
 *
 * Что сторожится:
 *   • панель: у «Подвала» всех пяти тем есть поле `customLogo` — загрузка
 *     картинки («image») с подписью «Логотип» и пределом 500 КБ, первым в
 *     списке (конфиг берётся тем же контроллером, что отдаёт его конструктору);
 *   • рендер: загруженный логотип попадает в подвал КАРТИНКОЙ со ссылкой на
 *     главную — порт каждой темы, живая цепочка пропсов (как витрина и превью);
 *   • пусто: без поля, с пустой строкой и с пробелами подвал такой же, как был
 *     (vanilla — вордмарк темы, satin — название магазина, bloom — логотип
 *     брендинга или название, rose/flux — логотипа нет).
 *
 * Требует сборки: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RAW_CONFIG = resolve(__dirname, "puck-config-raw.mjs");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;
type Theme = (typeof THEMES)[number];

const OWN_LOGO = "https://minio.merfy.ru/merfy/sites/test/footer-own-logo.png";
const BRAND_LOGO = "https://minio.merfy.ru/merfy/brand/brand-logo.png";
const SHOP = "Магазин Проверки";

const distReady = existsSync(
  resolve(
    SITES_ROOT,
    "dist",
    "src",
    "controllers",
    "theme-puck-config.controller.js",
  ),
);

function manifestReady(theme: Theme): boolean {
  return existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );
}

type Row = { html?: string; error?: string; missing?: boolean };

function renderFooters(
  theme: Theme,
  propsList: Record<string, unknown>[],
): Row[] {
  const jobs = propsList.map((props) => ({
    block: "Footer",
    props: { id: "Footer-1", ...props },
    cascade: true,
    live: true,
  }));
  return JSON.parse(
    execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 128 * 1024 * 1024,
    }),
  ) as Row[];
}

/** Все <img src> внутри разметки подвала. */
function imgSrcs(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);
}

/** <a href="/"> … </a>, внутри которого стоит картинка с данным src. */
function homeLinkWithImg(html: string, src: string): boolean {
  const links = [
    ...html.matchAll(/<a\b[^>]*\bhref="\/"[^>]*>([\s\S]*?)<\/a>/g),
  ];
  return links.some((m) => m[1].includes(`src="${src}"`));
}

/**
 * Что подвал темы рисует на месте логотипа при ПУСТОМ поле — ровно то, что
 * было до поля (замер рендером старого кода 26.09).
 */
const EMPTY_FALLBACK: Record<Theme, (html: string) => void> = {
  vanilla: (html) =>
    expect(html).toContain('src="/icons/Vanila-designers.svg"'),
  satin: (html) =>
    expect(html).toMatch(
      new RegExp(`<a href="/"[^>]*font-logo[^>]*>${SHOP}</a>`),
    ),
  bloom: (html) => expect(html).toContain(`src="${BRAND_LOGO}"`),
  rose: (html) =>
    expect(imgSrcs(html).filter((s) => !s.includes("/icons/"))).toEqual([]),
  flux: (html) =>
    expect(imgSrcs(html).filter((s) => !s.includes("/icons/"))).toEqual([]),
};

describe("Подвал: поле «Логотип» в панели", () => {
  it("dist собран (pnpm build && pnpm build:blocks)", () => {
    expect(distReady).toBe(true);
  });

  const configs: Partial<Record<Theme, any>> = {};
  beforeAll(() => {
    if (!distReady) return;
    for (const theme of THEMES) {
      configs[theme] = JSON.parse(
        execFileSync("node", [RAW_CONFIG, theme], {
          cwd: SITES_ROOT,
          encoding: "utf-8",
          maxBuffer: 256 * 1024 * 1024,
        }),
      );
    }
  }, 300_000);

  it.each(THEMES)(
    "%s: поле загрузки «Логотип», 500 КБ — как у логотипа шапки",
    (theme) => {
      if (!distReady) return;
      const field = configs[theme]?.components?.Footer?.fields?.customLogo;
      expect(field).toEqual(
        expect.objectContaining({
          type: "image",
          label: "Логотип",
          maxSizeKb: 500,
        }),
      );
    },
  );

  it.each(THEMES)("%s: «Логотип» — первый параметр подвала", (theme) => {
    if (!distReady) return;
    const fields = configs[theme]?.components?.Footer?.fields ?? {};
    expect(Object.keys(fields)[0]).toBe("customLogo");
  });

  it.each(THEMES)(
    "%s: служебный logo (брендинг) в панель не выведен",
    (theme) => {
      if (!distReady) return;
      const fields = configs[theme]?.components?.Footer?.fields ?? {};
      expect(fields.logo === undefined || fields.logo.type === "hidden").toBe(
        true,
      );
    },
  );
});

describe("Подвал: рендер логотипа портом темы", () => {
  it.each(THEMES)(
    "%s: загруженный логотип — картинка со ссылкой на главную",
    (theme) => {
      if (!manifestReady(theme)) return;
      const [row] = renderFooters(theme, [
        { siteTitle: SHOP, logo: BRAND_LOGO, customLogo: OWN_LOGO },
      ]);
      expect(row.error).toBeUndefined();
      const html = row.html ?? "";
      // Одна и та же картинка может стоять дважды (десктоп/телефон у satin),
      // но хотя бы одна обязана быть ссылкой на главную.
      expect(imgSrcs(html)).toContain(OWN_LOGO);
      expect(homeLinkWithImg(html, OWN_LOGO)).toBe(true);
      // Свой логотип подвала вытесняет вордмарк темы и логотип брендинга.
      expect(html).not.toContain("Vanila-designers.svg");
      expect(imgSrcs(html)).not.toContain(BRAND_LOGO);
    },
  );

  it.each(THEMES)(
    "%s: размер — та же настройка «Размер», что у логотипа шапки",
    (theme) => {
      if (!manifestReady(theme)) return;
      const [row] = renderFooters(theme, [
        { siteTitle: SHOP, customLogo: OWN_LOGO },
      ]);
      const tags = [...(row.html ?? "").matchAll(/<img\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((t) => t.includes(OWN_LOGO));
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag).toMatch(/h-\[var\(--size-logo-width,\d+px\)\]/);
        expect(tag).toContain(`alt="${SHOP}"`);
      }
    },
  );

  it.each(THEMES)("%s: пустое поле — подвал как был", (theme) => {
    if (!manifestReady(theme)) return;
    const base = { siteTitle: SHOP, logo: BRAND_LOGO };
    const [absent, empty, blank] = renderFooters(theme, [
      base,
      { ...base, customLogo: "" },
      { ...base, customLogo: "   " },
    ]);
    expect(empty.html).toBe(absent.html);
    expect(blank.html).toBe(absent.html);
    EMPTY_FALLBACK[theme](absent.html ?? "");
  });
});
