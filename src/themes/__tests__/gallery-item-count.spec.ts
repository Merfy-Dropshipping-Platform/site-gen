/**
 * Галерея: три плитки — это канон, и лишние данные её не роняют.
 *
 * Владелец (2026-09-13): «Ты постоянно создаёшь параметры секций, которых нет
 * и не должно быть в принципе. Например, в галерее сделал так, что можно
 * добавлять больше фоток, хотя такого не должно быть». 2026-09-12 потолок был
 * поднят с 3 до 12 (c46a9d9e) — отклонение снято, панель снова разрешает три.
 *
 * Две вещи проверяются РАЗДЕЛЬНО, потому что это разные механизмы:
 *
 *   1. Потолок панели (`max: 3`) — им конструктор запрещает добавить четвёртую
 *      плитку (SortableItem: `canAddMore = items.length < arrayField.max`).
 *      Сторожится здесь точечно и целиком — гардом канона (panel-canon.spec).
 *
 *   2. Разбор ревизии — он обязан ПРИНЯТЬ четыре и больше. У мерчанта, успевшего
 *      добавить лишнее за сутки с поднятым потолком, ревизия уже лежит в БД;
 *      жёсткий `.max(3)` в zod отбраковал бы её целиком, и секция умерла бы
 *      вместо того, чтобы нарисовать три плитки. Поэтому ограничение живёт там,
 *      где оно действует: в панели и в портах (`items.slice(0, 3)`), а схема
 *      остаётся принимающей.
 *
 * Секция остаётся на странице при ЛЮБОМ количестве, включая ноль — второе
 * требование из того же баг-репорта, оно не отменялось.
 *
 * Требует собранных секций и блоков: pnpm build:blocks && pnpm build:theme-sections:all.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SCHEMA_PROBE = resolve(__dirname, "block-schema-probe.mjs");
const CANON_DUMP = resolve(__dirname, "panel-canon.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

/** Канонический потолок галереи. Менять нельзя — см. шапку файла. */
const MAX_TILES = 3;

/** Сколько плиток кладём в данные / сколько ждём на экране. */
const COUNTS: { given: number; drawn: number }[] = [
  { given: 0, drawn: 0 },
  { given: 1, drawn: 1 },
  { given: 2, drawn: 2 },
  { given: 3, drawn: 3 },
  // Сверх канона — данные «из вчера». Рисуются три, секция жива.
  { given: 4, drawn: MAX_TILES },
  { given: 6, drawn: MAX_TILES },
  { given: 12, drawn: MAX_TILES },
  { given: 40, drawn: MAX_TILES },
];

const item = (i: number) => ({
  id: `i${i}`,
  type: "image",
  url: "/placeholders/landscape-image.png",
  alt: `Изображение ${i}`,
});

describe("галерея — потолок в панели", () => {
  const built = existsSync(
    resolve(SITES_ROOT, "dist", "astro-blocks", "manifest.json"),
  );

  it("блоки собраны (pnpm build:blocks)", () => {
    expect(built).toBe(true);
  });

  it.each(THEMES)("%s: панель разрешает ровно 3 элемента", (theme) => {
    if (!built) return;
    const raw = execFileSync("node", [CANON_DUMP, "--theme", theme], {
      cwd: SITES_ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const items = JSON.parse(raw).themes[theme].Gallery.fields.items;
    expect(items.max).toBe(MAX_TILES);
    // Подпись поля обещает мерчанту тот же потолок, что и код: рассинхрон
    // «Элементы (макс 12)» при max: 3 — это уже враньё в интерфейсе.
    expect(items.label).toContain(String(MAX_TILES));
    expect(items.label).not.toMatch(/\b(4|5|6|7|8|9|1[0-9])\b/);
  });
});

describe("галерея — разбор ревизии не падает на лишних плитках", () => {
  const built = existsSync(
    resolve(SITES_ROOT, "dist", "astro-blocks", "manifest.json"),
  );

  const parse = (n: number) => {
    const props = {
      heading: "Галерея",
      items: Array.from({ length: n }, (_, i) => item(i + 1)),
      layout: "featured",
      padding: { top: 40, bottom: 40 },
    };
    const raw = execFileSync(
      "node",
      [SCHEMA_PROBE, "Gallery", JSON.stringify(props)],
      { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 },
    );
    return JSON.parse(raw) as {
      success: boolean;
      issues: string[];
      items: number | null;
    };
  };

  for (const n of [0, 3, 4, 12, 40]) {
    it(`${n} плиток в данных — схема принимает ревизию целиком`, () => {
      if (!built) return;
      const res = parse(n);
      expect(res.issues).toEqual([]);
      expect(res.success).toBe(true);
      // Схема ничего не режет: обрезка — дело порта, а не разбора.
      expect(res.items).toBe(n);
    });
  }
});

describe.each(THEMES)("галерея — количество плиток на экране (%s)", (theme) => {
  const built = existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );
  let rendered: Record<number, string> = {};

  beforeAll(() => {
    if (!built) return;
    // Рендерер ключует результат по имени блока, поэтому гоним по одному.
    rendered = {};
    for (const { given } of COUNTS) {
      const job = {
        block: "Gallery",
        props: {
          id: `Gallery-${given}`,
          heading: "Галерея",
          text: "Текст секции",
          colorScheme: "1",
          padding: { top: 40, bottom: 40 },
          layout: "featured",
          items: Array.from({ length: given }, (_, i) => item(i + 1)),
        },
      };
      const raw = execFileSync(
        "node",
        [RENDERER, theme, JSON.stringify([job])],
        { cwd: SITES_ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
      );
      const entry = JSON.parse(raw)[0] as { html?: string; error?: string };
      rendered[given] = entry.error
        ? `ОШИБКА: ${entry.error}`
        : (entry.html ?? "");
    }
  }, 180_000);

  it("секции темы собраны (pnpm build:theme-sections)", () => {
    expect(built).toBe(true);
  });

  // Единственная видимая плитка занимает всю ширину и получает собственное
  // соотношение сторон. Без этого rose и flux схлопывали её в нулевую высоту
  // (hero брал высоту от соседней колонки), а остальные темы оставляли её
  // прижатой к половине секции рядом с пустотой.
  it("одна плитка растягивается на всю ширину (16:9), а не жмётся в колонку", () => {
    if (!built) return;
    expect(rendered[1]).toContain("aspect-[16/9]");
  });

  it("три плитки сохраняют прежнюю раскладку", () => {
    if (!built) return;
    expect(rendered[3]).not.toContain("aspect-[16/9]");
  });

  for (const { given, drawn } of COUNTS) {
    it(`${given} элементов → ${drawn} плиток, секция и заголовок на месте`, () => {
      if (!built) return;
      const html = rendered[given];
      expect(html).not.toMatch(/^ОШИБКА/);
      expect(html).toContain(`data-puck-component-id="Gallery-${given}"`);
      expect(html).toContain("Галерея");
      expect((html.match(/<img/g) ?? []).length).toBe(drawn);
    });
  }
});
