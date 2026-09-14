/**
 * Секция «Страница» обязана иметь ритм отступов СВОЕЙ темы.
 *
 * Жалоба владельца 14.09: «отступы на странице Доставка не соблюдаются и не
 * совпадают с настройками». Замер живых витрин (viewport 1280, /delivery):
 *
 *   тема     --section-padding   Page padding-top/bottom
 *   rose     80px                80px / 80px   ← совпало СЛУЧАЙНО
 *   vanilla  120px               80px / 80px   ✗
 *   satin    40px                80px / 80px   ✗
 *   flux     64px                80px / 80px   ✗
 *
 * Причина не одна, их две, и вторая — настоящая:
 *
 *  1. `Page.classes.ts` НЕ несёт вертикального ритма ВООБЩЕ. У соседей по
 *     контенту он есть либо классом порта (`MainText` во vanilla —
 *     `py-16 lg:py-[120px]`, в satin — `py-12 md:py-16`), либо пер-блочными
 *     токенами (`Collections` — `pt-[var(--collections-root-padding-top)]`).
 *     У «Страницы» не было ничего: нет пропа `padding` — нет отступа совсем,
 *     ноль. Поэтому «ритм темы» для этой секции физически не существовал, и
 *     единственным источником числа оставался проп.
 *
 *  2. Число 80 приезжает из пропа `padding` секции. Проп в ревизии витрины
 *     появился из сида страницы (`packages/theme-<тема>/pages/delivery.json`
 *     и `about.json` — девять записей `Page` с одинаковым `{80,80}` во всех
 *     пяти темах, при том что ритм тем разный: 120/80/64/40/120). Сиды ведёт
 *     другой агент — их эта проверка не трогает и трогать не должна.
 *
 * Сторожим ровно (1) — механику блока:
 *   • нет пропа `padding`  → корень несёт `py-[var(--section-padding,…)]`,
 *     инлайн-стиля отступа нет (работает ритм темы);
 *   • есть проп `padding`  → инлайн-стиль с числом мерчанта (пер-секционная
 *     настройка по-прежнему сильнее темы — спека 2026-07-06).
 *
 * Мерим ЖИВОЙ рендер скомпилированного модуля той же лестницей, что витрина
 * (cascade + live), а не исходный текст: до правки исходник «выглядел
 * правильно» — `paddingStyle` пустой, — и всё равно давал ноль.
 *
 * Рендер требует сборки:
 *   pnpm build && pnpm build:blocks && pnpm build:theme-sections:all
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;
type Theme = (typeof THEMES)[number];

/** Токен вертикального ритма секции. Эмиттер — src/themes/tokens-css.ts. */
const RHYTHM_TOKEN = "--section-padding";

const PAGE_DIR = resolve(SITES_ROOT, "packages/theme-base/blocks/Page");

const baseProps = {
  id: "Page-delivery",
  siteId: "test-site",
  colorScheme: "scheme-1",
  headingSize: "large",
  heading: "Доставка",
  content: "<p>Текст страницы.</p>",
};

const built = (theme: string) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

function renderPage(theme: Theme, props: Record<string, unknown>): string {
  const jobs = [
    { block: "Page", props: { ...baseProps, ...props }, cascade: true, live: true },
  ];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (
    JSON.parse(raw) as {
      html?: string;
      error?: string;
      missing?: boolean;
      pipelineError?: string;
    }[]
  )[0];
  if (row.html === undefined) {
    throw new Error(
      `рендер «Страница» (${theme}) не дал HTML: ${JSON.stringify(row)}`,
    );
  }
  return row.html;
}

/** Открывающий тег КОРНЯ секции — узла с data-puck-component-id блока. */
function rootTag(html: string): string {
  const tag = /<section[^>]*data-puck-component-id="Page-delivery"[^>]*>/i.exec(
    html,
  )?.[0];
  if (!tag) {
    throw new Error(
      `корень секции (data-puck-component-id="Page-delivery") в разметке не найден; ` +
        `первые 300 символов: ${html.slice(0, 300)}`,
    );
  }
  return tag;
}

const classOf = (tag: string) => /class="([^"]*)"/.exec(tag)?.[1] ?? "";
const styleOf = (tag: string) => /style="([^"]*)"/.exec(tag)?.[1] ?? "";

describe("Секция «Страница»: вертикальный ритм приходит из темы", () => {
  it.each(THEMES)("%s — сборка секций есть", (theme) => {
    expect(built(theme)).toBe(true);
  });

  describe.each(THEMES)("%s", (theme: Theme) => {
    it("без пропа padding корень несёт токен ритма темы", () => {
      const tag = rootTag(renderPage(theme, {}));
      const cls = classOf(tag);
      expect(cls).toMatch(
        new RegExp(`\\bpy-\\[var\\(${RHYTHM_TOKEN}[,)]`),
      );
    });

    it("без пропа padding инлайн-стиля отступа НЕТ (ничего не перебивает тему)", () => {
      const style = styleOf(rootTag(renderPage(theme, {})));
      expect(style).not.toMatch(/padding-(top|bottom)\s*:/);
    });

    it("проп padding мерчанта по-прежнему сильнее темы", () => {
      const style = styleOf(
        rootTag(renderPage(theme, { padding: { top: 24, bottom: 24 } })),
      );
      expect(style).toContain("padding-top:24px");
      expect(style).toContain("padding-bottom:24px");
    });
  });

  it("токен ритма объявлен в whitelist блока (Page.tokens.ts)", () => {
    const src = readFileSync(resolve(PAGE_DIR, "Page.tokens.ts"), "utf-8");
    // Разбираем САМ массив, а не текст файла: упоминание токена в комментарии
    // рядом — не объявление. (Саботаж: удаление строки `'--section-padding',`
    // при живом комментарии оставлял проверку зелёной.)
    const body = /PageTokens\s*=\s*\[([\s\S]*?)\]/.exec(src)?.[1] ?? "";
    expect(body).not.toBe("");
    const entries = body
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, "").trim())
      .flatMap((l) => [...l.matchAll(/'([^']+)'/g)].map((m) => m[1]));
    expect(entries).toContain(RHYTHM_TOKEN);
  });

  it("ритм корня — токен, а не число: в Page.classes.ts нет литерального py-/pt-/pb-", () => {
    const src = readFileSync(resolve(PAGE_DIR, "Page.classes.ts"), "utf-8");
    const root = /root:\s*([\s\S]*?),\n\s{2}\/\/|root:\s*([\s\S]*?),\n\s{2}container/.exec(
      src,
    );
    const rootDecl = (root?.[1] ?? root?.[2] ?? "").trim();
    expect(rootDecl).not.toBe("");
    // Разрешён только токенный вариант `py-[var(--…)]`; числовые лесенки
    // (`py-20`, `pt-[80px]`) вернули бы ту же болезнь другим способом.
    expect(rootDecl).not.toMatch(/\b(py|pt|pb)-(\d|\[\d)/);
  });
});
