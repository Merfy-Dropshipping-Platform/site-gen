/**
 * Цветовые схемы контейнеров и подвала — пять тем, живой путь рендера.
 *
 * Четыре замечания тестировщика (2026-09-13), все про схемы:
 *   п.2  «Мультиряды»: не применяется цветовая схема контейнера. Контейнер —
 *        это ВСЯ половина ряда напротив медиафайла.
 *   п.5  «Сворачиваемый раздел»: при включённом контейнере схема контейнера
 *        не применяется.
 *   п.9  «Подвал»: схема применяется раздельно — полоса с «Powered by Merfy»
 *        живёт по своим цветам, а не по схеме секции.
 *   п.10 при смене схемы подвала вылезает белая полоса на всех страницах.
 *
 * Общий корень п.2/п.5 и половины п.9: `adaptLegacyProps`
 * (src/themes/page-blocks.ts, `coerceGenericLegacyProps`) переводит
 * `colorScheme` / `containerColorScheme` из строки "scheme-N" в ЧИСЛО N, а
 * порты тем сверяли `typeof p.X === "string"`. На сыром рендере класс был, на
 * живом (витрина + POST /preview/block) — исчезал. Поэтому ВСЕ проверки здесь
 * идут через `live: true`: это ровно та цепочка, что видит мерчант.
 *
 * Корень п.10 отдельный и арифметический: полоса копирайта у rose/flux красилась
 * в `--color-heading`. У любой тёмной схемы heading светлый (merchant-сид
 * scheme-1: bg #000000, heading #FFFFFF), значит полоса — БЕЛАЯ, и она внизу
 * каждой страницы магазина.
 *
 * Требует собранных секций: pnpm build:theme-sections <тема> для всех пяти.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Схема секции и схема контейнера намеренно РАЗНЫЕ — иначе не отличить. */
const SECTION_SCHEME = "scheme-2";
const CONTAINER_SCHEME = "scheme-4";

type Job = { block: string; props: Record<string, unknown>; live?: boolean };

function render(theme: string, jobs: Job[]): string[] {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return (
    JSON.parse(raw) as {
      html?: string;
      error?: string;
      pipelineError?: string;
      missing?: boolean;
    }[]
  ).map((r) =>
    r.missing
      ? "MISSING"
      : r.error || r.pipelineError
        ? `ERROR:${r.error ?? r.pipelineError}`
        : (r.html ?? ""),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Инструмент замера. Разметка у пяти тем разная (li/div/section, свои классы),
// поэтому ищем не «известный узел», а «узел, несущий класс схемы» и смотрим,
// что внутри него. Иначе проверка знала бы вёрстку одной темы и врала на
// остальных.
// ─────────────────────────────────────────────────────────────────────────

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
  // SVG-примитивы попадаются внутри секций (стрелки, иконки).
  "path",
  "circle",
  "rect",
  "line",
  "polygon",
  "polyline",
  "ellipse",
  "stop",
  "use",
]);

/** Экранирование для подстановки в RegExp. */
const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Внешний HTML элемента, открывающий тег которого начинается на позиции
 * `index`. Глубину считаем по одноимённым тегам — для корректной разметки
 * этого достаточно, а собственного парсера в тесте держать не хочется.
 */
function subtreeAt(html: string, index: number): string | null {
  const open = /^<([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/.exec(html.slice(index));
  if (!open) return null;
  const tag = open[1].toLowerCase();
  if (VOID_TAGS.has(tag) || open[2] === "/") return open[0];
  const walker = new RegExp(`<(/?)${rx(tag)}\\b[^>]*?(/?)>`, "gi");
  walker.lastIndex = index + open[0].length;
  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = walker.exec(html))) {
    if (t[2] === "/") continue;
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(index, walker.lastIndex);
  }
  return null;
}

/** Позиции открывающих тегов, у которых в class есть `cls`. */
function openingsWithClass(html: string, cls: string): number[] {
  const re = new RegExp(
    `<[a-zA-Z][\\w-]*\\b[^>]*\\bclass="[^"]*(?<![-\\w])${rx(cls)}(?![-\\w])[^"]*"`,
    "g",
  );
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m.index);
  return out;
}

/** Внешний HTML первого элемента, у которого в class есть `cls`. */
function subtreeByClass(html: string, cls: string): string | null {
  const [at] = openingsWithClass(html, cls);
  return at === undefined ? null : subtreeAt(html, at);
}

/**
 * Самый ВНУТРЕННИЙ элемент с фоновым классом, в поддереве которого есть
 * `marker`. Так находится «полоса копирайта» в любой из пяти вёрсток, не
 * завися ни от тега, ни от data-атрибута (у rose полоса помечена
 * `copyright`, у остальных — `bottomStrip`).
 */
function innermostPaintedBox(html: string, marker: string): string | null {
  const re = /<[a-zA-Z][\w-]*\b[^>]*\bclass="[^"]*(?<![-\w])bg-[^"]*"/g;
  let best: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const sub = subtreeAt(html, m.index);
    if (!sub || !sub.includes(marker)) continue;
    if (!best || sub.length < best.length) best = sub;
  }
  return best;
}

/**
 * Самый ВНЕШНИЙ закрашенный бокс — основная поверхность подвала. У rose/flux/
 * satin/bloom это сам <footer>, у vanilla — внутренний div (на <footer> фона
 * нет). Берём первый по порядку документа: он же и самый внешний.
 */
function outermostPaintedBox(html: string): string | null {
  const m = /<[a-zA-Z][\w-]*\b[^>]*\bclass="[^"]*(?<![-\w])bg-[^"]*"/.exec(
    html,
  );
  return m ? subtreeAt(html, m.index) : null;
}

/**
 * Какой ЦВЕТОВОЙ ТОКЕН красит бокс: `--color-bg` / `--color-surface` / …
 * Именно сравнение токенов отвечает на вопрос «одна схема на всю секцию или
 * две»: класс `.color-scheme-N` задаёт все переменные разом, но два узла могут
 * читать РАЗНЫЕ переменные одной схемы и расходиться в цвете.
 */
function bgToken(sub: string | null): string | null {
  if (!sub) return null;
  const cls = classesOf(sub);
  const viaVar = /bg-\[rgb\(var\((--color-[a-z0-9-]+)/.exec(cls);
  if (viaVar) return viaVar[1];
  // Захардкоженный фон (bg-black и подобные) — тоже ответ, просто плохой.
  return /(?<![-\w])(bg-[a-z0-9[\]#_-]+)/.exec(cls)?.[1] ?? null;
}

/** Открывающий тег поддерева (там, где висят классы). */
const openTagOf = (sub: string) => /^<[^>]*>/.exec(sub)?.[0] ?? "";

const classesOf = (sub: string) =>
  /\bclass="([^"]*)"/.exec(openTagOf(sub))?.[1] ?? "";

const built = (theme: string) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

// ─────────────────────────────────────────────────────────────────────────
// Фикстуры
// ─────────────────────────────────────────────────────────────────────────

const ROW_TITLE = "ЗАГОЛОВОК-РЯДА-ПРУФ";
const ROW_TEXT = "ТЕКСТ-РЯДА-ПРУФ";

function multiRowsProps(extra: Record<string, unknown>) {
  return {
    id: "MultiRows-1",
    colorScheme: SECTION_SCHEME,
    padding: { top: 40, bottom: 40 },
    heading: "Ряды",
    rows: [
      {
        id: "row-1",
        title: ROW_TITLE,
        description: ROW_TEXT,
        // Картинка обязательна: «контейнер» определяется как половина ряда
        // НАПРОТИВ медиа, значит в разметке медиа должно быть.
        image: "https://example.invalid/row.jpg",
        size: "medium",
        headingSize: "small",
        textSize: "small",
        button: { text: "Кнопка", link: "/about" },
      },
    ],
    ...extra,
  };
}

const FAQ_HEADING = "ВОПРОС-ПРУФ";

function collapsibleProps(extra: Record<string, unknown>) {
  return {
    id: "Collapsible-1",
    colorScheme: SECTION_SCHEME,
    padding: { top: 40, bottom: 40 },
    heading: "Вопросы",
    sections: [{ id: "s1", heading: FAQ_HEADING, content: "Ответ" }],
    ...extra,
  };
}

const STRIP_MARKER = "ПОЛОСА-ПРУФ";

function footerProps(extra: Record<string, unknown> = {}) {
  return {
    id: "Footer-1",
    colorScheme: SECTION_SCHEME,
    bottomStrip: { enabled: true, text: STRIP_MARKER },
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// п.2 — Мультиряды
// ─────────────────────────────────────────────────────────────────────────

describe.each(THEMES)("п.2 Мультиряды: схема контейнера — %s", (theme) => {
  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built(theme)).toBe(true);
  });

  it("схема контейнера красит половину ряда напротив медиа", () => {
    if (!built(theme)) return;
    const [html] = render(theme, [
      {
        block: "MultiRows",
        props: multiRowsProps({ containerColorScheme: CONTAINER_SCHEME }),
        live: true,
      },
    ]);
    expect(html).not.toMatch(/^ERROR:/);
    // Калибровка замера: ряд отрисован и медиа в нём есть — иначе «нет
    // картинки в контейнере» стало бы ложно-зелёным.
    expect(html).toContain(ROW_TITLE);
    expect(html).toMatch(/<img\b/);

    const box = subtreeByClass(html, "color-scheme-4");
    expect(box).not.toBeNull();
    const sub = box as string;
    // Контейнер = текстовая половина: в нём заголовок и текст ряда…
    expect(sub).toContain(ROW_TITLE);
    expect(sub).toContain(ROW_TEXT);
    // …и НЕТ медиа (иначе это обёртка всего ряда, а не «противоположная часть»).
    expect(sub).not.toMatch(/<img\b/);
    // Класс схемы сам по себе только переопределяет CSS-переменные. Чтобы
    // мерчант увидел цвет, на том же узле обязаны быть утилиты, читающие их.
    const cls = classesOf(sub);
    expect(cls).toMatch(/bg-\[rgb\(var\(--color-bg/);
    expect(cls).toMatch(/text-\[rgb\(var\(--color-text/);
  });

  it("САБОТАЖ: без выбранной схемы контейнера разметка не меняется", () => {
    if (!built(theme)) return;
    const [withScheme, without] = render(theme, [
      {
        block: "MultiRows",
        props: multiRowsProps({ containerColorScheme: CONTAINER_SCHEME }),
        live: true,
      },
      { block: "MultiRows", props: multiRowsProps({}), live: true },
    ]);
    expect(without).not.toMatch(/^ERROR:/);
    expect(without).not.toContain("color-scheme-4");
    // И проверка не вырождается: с выбранной схемой разметка ДРУГАЯ.
    expect(withScheme).not.toBe(without);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// п.5 — Сворачиваемый раздел
// ─────────────────────────────────────────────────────────────────────────

describe.each(THEMES)(
  "п.5 Сворачиваемый раздел: схема контейнера — %s",
  (theme) => {
    it("при включённом контейнере схема контейнера доезжает до разметки", () => {
      if (!built(theme)) return;
      const [html] = render(theme, [
        {
          block: "CollapsibleSection",
          props: collapsibleProps({
            containerEnabled: "true",
            containerColorScheme: CONTAINER_SCHEME,
          }),
          live: true,
        },
      ]);
      expect(html).not.toMatch(/^ERROR:/);
      expect(html).toContain(FAQ_HEADING);

      const box = subtreeByClass(html, "color-scheme-4");
      expect(box).not.toBeNull();
      // Схема должна лежать НА контейнере пунктов, а не где-то рядом.
      expect(box as string).toContain(FAQ_HEADING);
    });

    it("САБОТАЖ: выключённый контейнер схему контейнера не применяет", () => {
      if (!built(theme)) return;
      const [on, off] = render(theme, [
        {
          block: "CollapsibleSection",
          props: collapsibleProps({
            containerEnabled: "true",
            containerColorScheme: CONTAINER_SCHEME,
          }),
          live: true,
        },
        {
          block: "CollapsibleSection",
          props: collapsibleProps({
            containerEnabled: "false",
            containerColorScheme: CONTAINER_SCHEME,
          }),
          live: true,
        },
      ]);
      expect(off).not.toMatch(/^ERROR:/);
      expect(off).not.toContain("color-scheme-4");
      expect(on).toContain("color-scheme-4");
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────
// п.9 / п.10 — Подвал
// ─────────────────────────────────────────────────────────────────────────

describe.each(THEMES)(
  "п.9/10 Подвал: одна схема на всю секцию — %s",
  (theme) => {
    it("п.9 своя цветовая схема доезжает до <footer> на живом пути", () => {
      if (!built(theme)) return;
      const [html] = render(theme, [
        { block: "Footer", props: footerProps(), live: true },
      ]);
      expect(html).not.toMatch(/^ERROR:/);
      expect(html).toMatch(/<footer\b/);
      const footer = subtreeByClass(html, "color-scheme-2");
      expect(footer).not.toBeNull();
      expect(openTagOf(footer as string)).toMatch(/^<footer\b/);
    });

    it("п.9 полоса «Powered by Merfy» красится ТЕМ ЖЕ токеном, что и тело подвала", () => {
      if (!built(theme)) return;
      const [html] = render(theme, [
        { block: "Footer", props: footerProps(), live: true },
      ]);
      expect(html).not.toMatch(/^ERROR:/);
      // Калибровка: полоса вообще отрисована, и закрашенные боксы найдены.
      expect(html).toContain(STRIP_MARKER);

      const body = bgToken(outermostPaintedBox(html));
      const strip = bgToken(innermostPaintedBox(html, STRIP_MARKER));
      expect(body).not.toBeNull();
      expect(strip).not.toBeNull();
      // Ключ пункта 9: одна поверхность на всю секцию. У flux/satin тело подвала
      // стоит на --color-surface, у rose/vanilla/bloom — на --color-bg; важно не
      // конкретное имя, а РАВЕНСТВО: иначе схема «применяется раздельно».
      expect(strip).toBe(body);
      // Текст полосы — текст схемы, а не инверсия.
      expect(innermostPaintedBox(html, STRIP_MARKER)).toMatch(
        /text-\[rgb\(var\(--color-text/,
      );
    });

    it("п.10 фон полосы НЕ привязан к --color-heading и не захардкожен", () => {
      if (!built(theme)) return;
      const [html] = render(theme, [
        { block: "Footer", props: footerProps(), live: true },
      ]);
      const strip = bgToken(innermostPaintedBox(html, STRIP_MARKER));
      expect(strip).not.toBeNull();
      // Именно это давало белую полосу: у тёмной схемы heading светлый
      // (merchant-сид scheme-1: bg #000000, heading #FFFFFF) — фон полосы
      // становился белым внизу КАЖДОЙ страницы магазина.
      expect(strip).not.toBe("--color-heading");
      // И не захардкоженная палитра: она не реагирует на схему вовсе.
      expect(strip).toMatch(/^--color-/);
    });

    it("САБОТАЖ: разные схемы подвала дают разную разметку", () => {
      if (!built(theme)) return;
      const [a, b] = render(theme, [
        {
          block: "Footer",
          props: footerProps({ colorScheme: "scheme-2" }),
          live: true,
        },
        {
          block: "Footer",
          props: footerProps({ colorScheme: "scheme-4" }),
          live: true,
        },
      ]);
      expect(a).not.toMatch(/^ERROR:/);
      expect(b).not.toMatch(/^ERROR:/);
      expect(a).not.toBe(b);
      expect(a).toContain("color-scheme-2");
      expect(b).toContain("color-scheme-4");
    });
  },
);
