/**
 * Сторож Shopify-раскладки «Изображение с текстом» — ТОЛЬКО bloom.
 *
 * Владелец, 2026-09-17, дословно: «У Shopify видишь какие состояния у текста
 * с изображением. То есть тут какая-то вот настройка layout, а у нас это
 * настройка контейнер. И нужно сделать так же, чтобы менялись расположения.
 * И сделать пока это только на Bloom». Тумблер «Контейнер» заменён на
 * `layout` (no-overlap/overlap) + `position` (top/middle/bottom); `width`
 * при наложении меняет пропорцию карточка/фото.
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

describe("bloom ImageWithText — Shopify layout (layout/position/width)", () => {
  const rows = render([
    { block: "ImageWithText", props: { ...base, layout: "no-overlap" } },
    { block: "ImageWithText", props: { ...base, layout: "overlap" } },
    { block: "ImageWithText", props: { ...base, layout: "overlap", width: "small" } },
    { block: "ImageWithText", props: { ...base, layout: "overlap", width: "large" } },
    { block: "ImageWithText", props: { ...base, layout: "overlap", position: "top" } },
    { block: "ImageWithText", props: { ...base, layout: "overlap", position: "bottom" } },
    // Легаси данные (containerEnabled='true', сохранены 15-16.09) должны
    // по-прежнему давать наложение — backward-compat fallback.
    { block: "ImageWithText", props: { ...base, containerEnabled: "true" } },
  ]);

  const [noOverlap, overlap, overlapSmall, overlapLarge, posTop, posBottom, legacyContainer] = rows;

  it("рендер не падает ни на одном job (0 проверок — тоже провал)", () => {
    expect(rows).toHaveLength(7);
    for (const r of rows) {
      expect(r.error).toBeUndefined();
      expect(r.missing).toBeUndefined();
      expect(typeof r.html).toBe("string");
    }
  });

  it("layout='no-overlap' НЕ включает наложение (нет lg:absolute на карточке)", () => {
    expect(noOverlap.html).not.toMatch(/lg:absolute/);
  });

  it("layout='overlap' ВКЛЮЧАЕТ наложение (карточка lg:absolute поверх фото)", () => {
    expect(overlap.html).toMatch(/lg:absolute/);
  });

  it("наезд включается и выключается — разметка двух состояний различается", () => {
    expect(overlap.html).not.toBe(noOverlap.html);
  });

  it("width при наложении меняет ПРОПОРЦИЮ карточки (small ≠ large)", () => {
    expect(overlapSmall.html).toMatch(/lg:w-\[36%\]/);
    expect(overlapLarge.html).toMatch(/lg:w-\[62%\]/);
    expect(overlapSmall.html).not.toBe(overlapLarge.html);
  });

  it("position меняет вертикальное положение карточки (top ≠ bottom)", () => {
    expect(posTop.html).toMatch(/lg:top-6/);
    expect(posBottom.html).toMatch(/lg:bottom-6/);
    expect(posTop.html).not.toBe(posBottom.html);
  });

  it("легаси containerEnabled='true' по-прежнему даёт наложение (backward-compat)", () => {
    expect(legacyContainer.html).toMatch(/lg:absolute/);
  });
});
