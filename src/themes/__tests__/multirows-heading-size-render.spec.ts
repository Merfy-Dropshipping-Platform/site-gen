/**
 * «Размер заголовка» мультирядов обязан слушаться панели — во всех пяти темах.
 *
 * Панель пишет размер в top-level `headingSize` (select «Размер заголовка»),
 * а поле `heading` — обычная aiText-строка. В старых ревизиях у мерчантов
 * остался легаси-конверт `heading: { text, size }`. До 2026-09-13 порты
 * rose/flux/vanilla/satin читали `p.heading?.size ?? p.headingSize`, то есть
 * ЛЕГАСИ ПЕРЕБИВАЛ выбор мерчанта, и настройка выглядела мёртвой. bloom читал
 * top-level первым и работал.
 *
 * Канон (тот же механизм, что у `Collections.headingSize` во всех темах и у
 * `Popular`/`Gallery`): `p.headingSize ?? p.heading?.size` — панель важнее,
 * легаси только как запасной источник.
 *
 * Проверяем РЕНДЕРОМ настоящего скомпилированного модуля темы (того, что
 * уходит на витрину и в превью), через живую нормализацию рантайма
 * (adaptLegacyProps → resolveBlockProps), как это делает preview.service.
 *
 * Требует собранных секций: pnpm build:theme-sections <тема> для всех пяти.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

type Heading = string | Record<string, unknown>;

function blockProps(heading: Heading, headingSize?: string) {
  return {
    id: "MultiRows-1",
    colorScheme: "1",
    padding: { top: 40, bottom: 40 },
    heading,
    ...(headingSize ? { headingSize } : {}),
    rows: [
      {
        id: "row-1",
        title: "Ряд",
        description: "Текст",
        image: "",
        size: "medium",
        headingSize: "small",
        textSize: "small",
        button: { text: "Кнопка", link: "/about" },
      },
    ],
  };
}

function render(theme: string, jobs: { block: string; props: unknown }[]): string[] {
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

/**
 * Открывающий тег заголовка СЕКЦИИ (тот, сразу за которым идёт текст).
 *
 * Искать просто «Заголовок» по строке нельзя: первым попадается `alt` у <img>
 * ряда, и замер начинает врать «размер не меняется» на любой теме. Поймано на
 * этой же задаче — поэтому якорь именно текстовый узел после `>`.
 */
function headingTag(html: string): string {
  const m = /<h2\b([^>]*)>\s*Заголовок/.exec(html);
  return m ? m[1] : "";
}

/** Классы/переменные, отвечающие за РАЗМЕР (цвет отбрасываем — он тоже text-[…]). */
function sizeTokens(html: string): string {
  const cls = /class="([^"]*)"/.exec(headingTag(html))?.[1] ?? "";
  return (
    cls.match(/(?:md:)?text-\[[^\]]+\]|\[--[a-z-]*size[^\]]*\]/g) ?? []
  )
    .filter((t) => !/color|rgb/.test(t))
    .join(" ");
}

describe.each(THEMES)("«Размер заголовка» мультирядов — %s", (theme) => {
  const built = existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  it("small / medium / large дают ТРИ разные разметки заголовка", () => {
    if (!built) return;
    const [small, medium, large] = render(theme, [
      { block: "MultiRows", props: blockProps("Заголовок", "small"), pipeline: true },
      { block: "MultiRows", props: blockProps("Заголовок", "medium"), pipeline: true },
      { block: "MultiRows", props: blockProps("Заголовок", "large"), pipeline: true },
    ] as never);
    for (const html of [small, medium, large]) expect(html).not.toMatch(/^ERROR:/);
    // Саботаж-страховка: если якорь заголовка перестал находиться, размеры
    // станут пустыми строками и «все разные» выродится в ложно-зелёный тест.
    expect(sizeTokens(small)).not.toBe("");
    expect(sizeTokens(large)).not.toBe("");
    expect(sizeTokens(small)).not.toBe(sizeTokens(medium));
    expect(sizeTokens(large)).not.toBe(sizeTokens(medium));
    expect(sizeTokens(small)).not.toBe(sizeTokens(large));
  });

  it("выбор в панели перебивает легаси-конверт heading.size", () => {
    if (!built) return;
    // Легаси-объект с «чужим» ключом не разворачивается coerceLegacyValue и
    // доезжает до порта как объект — ровно так настройка и умирала.
    const legacy = { text: "Заголовок", size: "small", anchor: "x" };
    const [viaLegacy, viaPanel] = render(theme, [
      { block: "MultiRows", props: blockProps(legacy, "large"), pipeline: true },
      { block: "MultiRows", props: blockProps("Заголовок", "large"), pipeline: true },
    ] as never);
    expect(viaLegacy).not.toMatch(/^ERROR:/);
    expect(sizeTokens(viaPanel)).not.toBe("");
    expect(sizeTokens(viaLegacy)).toBe(sizeTokens(viaPanel));
  });

  it("без явного выбора размер совпадает с medium — существующие секции не поедут", () => {
    if (!built) return;
    const [none, medium] = render(theme, [
      { block: "MultiRows", props: blockProps("Заголовок"), pipeline: true },
      { block: "MultiRows", props: blockProps("Заголовок", "medium"), pipeline: true },
    ] as never);
    expect(none).not.toMatch(/^ERROR:/);
    expect(sizeTokens(none)).toBe(sizeTokens(medium));
  });
});
