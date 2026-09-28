import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { PAGE_REGISTRY, VERBATIM_PREFIXES } from "../page-registry";

/**
 * Ссылки по умолчанию (без данных мерчанта) обязаны вести ТОЛЬКО на страницы
 * магазина — маршруты платформы, а не на демо-страницы верстальщиков.
 *
 * Владелец 25.09, дословно: «страницы только магазинные, без верстальщиков».
 * Живой баг-пример: bloom вёл кнопку первого экрана, кнопку «about» и пункт
 * шапки на `/skin-care` (демо-категория верстальщика bloom) — у нового
 * магазина такой страницы нет, покупатель попадал на «не найдено». Тем же
 * приёмом (сплошной обход исходников, а не список файлов, которые правила эта
 * задача) поймано у остальных тем: flux — пункты шапки `/catalog/naushniki`
 * (`/catalog/tws`, `/catalog/kolonki`, `/catalog/saundbary`, демо-категории
 * магазина наушников верстальщика); vanilla — пункты шапки/подвала и кнопки
 * `/catalog/textile`/`/catalog/decor` (демо-категории верстальщика текстиля);
 * satin — ссылки подвала «Возврат»/«Оплата» на `/returns`/`/payment` (таких
 * страниц в реестре нет вовсе, только `/legal/<slug>`).
 *
 * ЧТО СТОРОЖИМ: сплошной обход `themes/<t>/src`, `packages/theme-<t>`
 * (включая `pages/*.json` и `theme.json`) для всех пяти тем + общий
 * `packages/theme-base` — КАЖДЫЙ статический литерал `href` обязан либо
 * (а) быть внешней/якорной/файловой ссылкой (http(s):, mailto:, tel:, `#...`,
 * картинка/шрифт/xml), либо (б) вести на страницу платформы:
 *   • CONTENT-страницы реестра (`kind:'content'`, например `catalog`, `about`,
 *     `cart`) — ТОЧНОЕ совпадение маршрута: у них одна страница, без вложенных
 *     путей (`/catalog/textile` НЕ равно `/catalog` — этим и была ошибка);
 *   • VERBATIM-страницы (`kind:'verbatim'`, например `product`, `account`,
 *     `checkout`, `login`) + плоский `VERBATIM_PREFIXES` (`legal`, `products`,
 *     `auth`, `blog`, …) — маршрут ОТКРЫТ вглубь (`/legal/return`,
 *     `/account/profile` — вложенные пути тут норма платформы);
 *   • четыре страницы аутентификации вне реестра (`register`,
 *     `reset-password`, `verify-email`, `verify` — держит
 *     `STATIC_TEMPLATE_PAGES` в `build.service.ts`, отдельно от
 *     `page-registry.ts`) — точным совпадением, как контентные.
 * Глубже (какая именно `/legal/<slug>` реально существует) не сторожим — как
 * и решение владельца, речь о «странице магазина», а не о конкретном слаге.
 *
 * Комментарии (`//…`, `/*…* /`) из обхода вычищены: `href="/product…"` в
 * пояснении «не <a href="/product…">» — не ссылка, а текст комментария.
 *
 * `packages/theme-contract/tokens/sources/*` — застывшие выжимки для снятия
 * токенов, на витрине не рисуются (то же исключение, что в
 * `card-name-price-follows-text.spec.ts`) — в обход не входят вовсе (не
 * лежат ни в одном из трёх пройденных корней).
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "bloom", "satin", "flux"] as const;

const WALK_SKIP = ["node_modules", "__tests__", "/dist/", "/.astro/"];
const WALK_EXT = /\.(astro|ts|tsx|json)$/;

function walkSources(dir: string, acc: string[] = []): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of names) {
    const full = join(dir, name);
    const rel = relative(SITES_ROOT, full);
    if (WALK_SKIP.some((s) => `/${rel}/`.includes(s) || rel.includes(s))) continue;
    if (statSync(full).isDirectory()) walkSources(full, acc);
    else if (WALK_EXT.test(name)) acc.push(full);
  }
  return acc;
}

const walked = [
  ...THEMES.flatMap((t) => walkSources(resolve(SITES_ROOT, "themes", t, "src"))),
  ...THEMES.flatMap((t) => walkSources(resolve(SITES_ROOT, "packages", `theme-${t}`))),
  ...walkSources(resolve(SITES_ROOT, "packages", "theme-base")),
];

/** Держит STATIC_TEMPLATE_PAGES (build.service.ts) вне page-registry.ts. */
const EXTRA_EXACT_ROUTES = ["register", "reset-password", "verify-email", "verify"];

/** Контентные страницы + четвёрка аутентификации — ТОЧНЫЙ маршрут, без вложенных путей. */
const EXACT_ROUTES: ReadonlySet<string> = new Set<string>([
  ...PAGE_REGISTRY.filter((e) => e.kind === "content").map((e) => e.route),
  ...EXTRA_EXACT_ROUTES,
]);

/** Verbatim-страницы реестра + плоский список — маршрут открыт вглубь по первому сегменту. */
const PREFIX_SEGMENTS: ReadonlySet<string> = new Set<string>([
  ...PAGE_REGISTRY.filter((e) => e.kind === "verbatim").map((e) => e.route.split("/")[0]),
  ...VERBATIM_PREFIXES,
]);

/** `href` строковым литералом — и в JSX (`href="x"`), и в объекте JS/TS
 *  (`href: "x"`), и в JSON (`"href": "x"`, закрывающая кавычка ключа перед
 *  двоеточием). Динамические ссылки (шаблонные строки, `{expr}`) в кавычки
 *  не попадают — не наш обход (не «ссылка по умолчанию» литералом). */
const HREF_LITERAL = /href"?\s*[:=]\s*"([^"]*)"/g;

/** Не маршрут страницы: внешняя, якорная, протокольная или файловая ссылка. */
const NOT_A_PAGE =
  /^(#|https?:\/\/|\/\/|mailto:|tel:)|\.(svg|png|jpe?g|webp|gif|woff2?|ttf|ico|xml|css|js|json)$/i;
/** Служебные неймспейсы платформы — не страницы конструктора. */
const ASSET_NAMESPACE = /^\/(images|icons|fonts|placeholders|branding|data|api)\//;

/** `//…` и `/*…* /` вычищены до regex-обхода: строки комментариев — не код. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
}

type Violation = { file: string; href: string; line: number; text: string };

function isShopRoute(href: string): boolean {
  const path = href.split(/[?#]/)[0]!.replace(/^\/+/, "");
  if (EXACT_ROUTES.has(path)) return true;
  return PREFIX_SEGMENTS.has(path.split("/")[0]!);
}

function violationsOf(fileLabel: string, src: string): Violation[] {
  const out: Violation[] = [];
  const lines = stripComments(src).split("\n");
  lines.forEach((lineText, i) => {
    HREF_LITERAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = HREF_LITERAL.exec(lineText))) {
      const href = m[1]!;
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      if (NOT_A_PAGE.test(href) || ASSET_NAMESPACE.test(href)) continue;
      if (!isShopRoute(href)) {
        out.push({ file: fileLabel, href, line: i + 1, text: lineText.trim().slice(0, 140) });
      }
    }
  });
  return out;
}

function findViolations(files: string[]): Violation[] {
  return files.flatMap((f) => violationsOf(relative(SITES_ROOT, f), readFileSync(f, "utf-8")));
}

describe("ссылки по умолчанию — только страницы магазина (сплошной обход)", () => {
  it("обход видит исходники всех пяти тем + theme-base", () => {
    for (const t of THEMES) {
      expect(
        walked.some(
          (f) =>
            relative(SITES_ROOT, f).includes(`/${t}/`) || relative(SITES_ROOT, f).includes(`theme-${t}/`),
        ),
      ).toBe(true);
    }
    expect(walked.some((f) => relative(SITES_ROOT, f).includes("theme-base/"))).toBe(true);
    expect(walked.length).toBeGreaterThan(100);
  });

  it("реестр маршрутов не пуст (сторож не проверяет против пустого множества)", () => {
    expect(EXACT_ROUTES.size).toBeGreaterThan(5);
    expect(PREFIX_SEGMENTS.size).toBeGreaterThan(3);
  });

  it("ни одна ссылка по умолчанию не ведёт на адрес вне маршрутов платформы", () => {
    const violations = findViolations(walked);
    const report = violations
      .map((v) => `  ${v.file}:${v.line}  href="${v.href}"\n    ${v.text}`)
      .join("\n");
    expect(violations.length === 0 ? "" : `НАРУШЕНИЙ: ${violations.length}\n${report}`).toBe("");
  });

  // ── Саботаж: вернули демо-адрес верстальщика — сторож обязан покраснеть ──

  it('саботаж: href="/skin-care" (JSX) ловится', () => {
    const v = violationsOf("<инлайн>", 'href="/skin-care"');
    expect(v).toHaveLength(1);
    expect(v[0]!.href).toBe("/skin-care");
  });

  it('саботаж: href: "/catalog/textile" (объект JS/TS, вложенный путь ровной content-страницы) ловится', () => {
    const v = violationsOf("<инлайн>", '{ label: "Текстиль", href: "/catalog/textile" },');
    expect(v).toHaveLength(1);
    expect(v[0]!.href).toBe("/catalog/textile");
  });

  it('саботаж: "href": "/payment" (JSON, маршрута нет вовсе) ловится', () => {
    const v = violationsOf("<инлайн>", '        "href": "/payment"');
    expect(v).toHaveLength(1);
    expect(v[0]!.href).toBe("/payment");
  });

  it("саботаж: комментарий не маскирует находку — та же строка кодом рядом ловится", () => {
    const v = violationsOf(
      "<инлайн>",
      '// пример: не так, как href="/skin-care"\nconst real = { href: "/skin-care" };',
    );
    expect(v).toHaveLength(1);
  });

  it("контроль: content-страницы (точно), verbatim-страницы (вглубь), дом, якоря и внешние — не ловятся", () => {
    const lines = [
      'href="/catalog"',
      'href: "/legal/return"',
      '"href": "/account/profile"',
      'href="/product?id=42"',
      'href="/checkout"',
      'href="/reset-password"',
      'href="/"',
      'href="#collections"',
      'href="https://vk.com/"',
      'href="mailto:shop@example.com"',
      'href="/images/logo.svg"',
    ];
    for (const l of lines) expect(violationsOf("<инлайн>", l)).toHaveLength(0);
  });

  it("контроль: комментарий с href-примером НЕ ловится (текст пояснения, не код)", () => {
    const v = violationsOf(
      "<инлайн>",
      '// Герой — div, не <a href="/product…"> (иначе конструктор уводит на PDP).',
    );
    expect(v).toHaveLength(0);
  });
});
