/**
 * Сторож тумблера «Контейнер» «Изображение с текстом» — ТОЛЬКО bloom.
 *
 * 1. b73, владелец, 2026-09-17, дословно: «У Shopify видишь какие состояния
 *    у текста с изображением. То есть тут какая-то вот настройка layout, а
 *    у нас это настройка контейнер. И нужно сделать так же, чтобы менялись
 *    расположения. И сделать пока это только на Bloom». Тумблер «Контейнер»
 *    заменили на `layout` (no-overlap/overlap) + `position` (top/middle/
 *    bottom).
 * 2. b79, тот же день, владелец дословно: «Давай по 22-му назовём не
 *    "Раскладка", а "Контейнер", как везде. То есть вместо раскладки
 *    контейнер. Вот этот, который вкл-выкл наш» — название и форма контрола
 *    вернулись: поле снова `containerEnabled` ('false'|'true'), toggle
 *    Показать/Скрыть, как у MultiColumns/MultiRows/CollapsibleSection.
 *    Поведение (карточка наезжает на фото при включении) НЕ менялось.
 *    `position` владелец не трогал — оставлено как есть.
 *
 * Рендерим РЕАЛЬНЫЙ скомпилированный порт bloom (dist/theme-sections/bloom),
 * не исходный текст — сторож должен ловить регрессию сборки, а не только кода.
 * Требует: pnpm build:theme-sections:all (см. AGENTS правило гочи замера).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");

type Job = { block: string; props: Record<string, unknown> };
type Row = { block: string; html?: string; missing?: boolean; error?: string };

function render(jobs: Job[]): Row[] {
  const raw = execFileSync("node", [RENDERER, "bloom", JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw) as Row[];
}

const base = {
  colorScheme: "1",
  padding: { top: 40, bottom: 40 },
  image: { url: "/MK-IWT-IMG.png", alt: "" },
  heading: "MK_HEAD",
  text: { content: "MK_TEXT" },
  button: { text: "MK_BTN", href: "/catalog" },
};

describe("bloom ImageWithText — «Контейнер» (containerEnabled/position/width)", () => {
  const rows = render([
    { block: "ImageWithText", props: { ...base, containerEnabled: "false" } },
    { block: "ImageWithText", props: { ...base, containerEnabled: "true" } },
    {
      block: "ImageWithText",
      props: { ...base, containerEnabled: "true", width: "small" },
    },
    {
      block: "ImageWithText",
      props: { ...base, containerEnabled: "true", width: "large" },
    },
    {
      block: "ImageWithText",
      props: { ...base, containerEnabled: "true", position: "top" },
    },
    {
      block: "ImageWithText",
      props: { ...base, containerEnabled: "true", position: "bottom" },
    },
    // Легаси данные `layout` (сохранены 15-17.09, до переименования обратно
    // в «Контейнер») должны по-прежнему давать наложение — backward-compat
    // fallback №2 (приоритет №1 — сегодняшний containerEnabled).
    { block: "ImageWithText", props: { ...base, layout: "overlap" } },
    { block: "ImageWithText", props: { ...base, layout: "no-overlap" } },
    // Ещё более старые данные (containerEnabled='true' до 15.09) читаются напрямую.
    {
      block: "ImageWithText",
      props: { ...base, containerEnabled: "true", layout: "no-overlap" },
    },
  ]);

  const [
    off,
    on,
    onSmall,
    onLarge,
    posTop,
    posBottom,
    legacyLayoutOverlap,
    legacyLayoutNoOverlap,
    newPriorityOverLegacy,
  ] = rows;

  it("рендер не падает ни на одном job (0 проверок — тоже провал)", () => {
    expect(rows).toHaveLength(9);
    for (const r of rows) {
      expect(r.error).toBeUndefined();
      expect(r.missing).toBeUndefined();
      expect(typeof r.html).toBe("string");
    }
  });

  it("containerEnabled='false' НЕ включает наложение (нет lg:absolute на карточке)", () => {
    expect(off.html).not.toMatch(/lg:absolute/);
  });

  it("containerEnabled='true' ВКЛЮЧАЕТ наложение (карточка lg:absolute поверх фото)", () => {
    expect(on.html).toMatch(/lg:absolute/);
  });

  it("наезд включается и выключается — разметка двух состояний различается", () => {
    expect(on.html).not.toBe(off.html);
  });

  // 2026-09-21: конкретные доли (40/58/75 % карточки против 67.5/49.5/32.5 %
  // фото) сторожит bloom-image-with-text-params.spec.ts — там же записан
  // замер эталона владельца, из которого они взяты. Здесь остаётся поведение:
  // «Ширина» обязана двигать пропорцию. Раньше тут стояли 36 % / 62 % — доли
  // прежней раскладки, где карточка плавала внутри фото во всю ширину пары.
  it("width при включённом контейнере меняет ПРОПОРЦИЮ карточки (small ≠ large)", () => {
    const cardPct = (html: string | undefined) =>
      [...(html ?? "").matchAll(/lg:w-\[([\d.]+)%\]/g)]
        .map((m) => m[1])
        .join(",");
    expect(cardPct(onSmall.html)).not.toBe("");
    expect(cardPct(onLarge.html)).not.toBe("");
    expect(cardPct(onSmall.html)).not.toEqual(cardPct(onLarge.html));
    expect(onSmall.html).not.toBe(onLarge.html);
  });

  // 2026-09-22: высоту пары задаёт МЕДИА (стоит в потоке со своей
  // пропорцией), плашка — абсолютный слой поверх. «Положение» двигает её
  // якорями с отступом 3,3 % — это эталонный вылет медиа за плашку.
  it("position меняет вертикальное положение карточки (top ≠ bottom) — не тронуто b79", () => {
    expect(posTop.html).toMatch(/lg:justify-start/);
    expect(posBottom.html).toMatch(/lg:justify-end/);
    expect(posTop.html).not.toBe(posBottom.html);
  });

  it("легаси layout='overlap' (данные 15-17.09) по-прежнему даёт наложение (backward-compat fallback)", () => {
    expect(legacyLayoutOverlap.html).toMatch(/lg:absolute/);
  });

  it("легаси layout='no-overlap' по-прежнему НЕ даёт наложение", () => {
    expect(legacyLayoutNoOverlap.html).not.toMatch(/lg:absolute/);
  });

  it("containerEnabled имеет приоритет над легаси layout, если оба присутствуют", () => {
    // containerEnabled='true' + layout='no-overlap' одновременно → наложение
    // включено (containerEnabled — источник истины №1).
    expect(newPriorityOverLegacy.html).toMatch(/lg:absolute/);
  });
});
