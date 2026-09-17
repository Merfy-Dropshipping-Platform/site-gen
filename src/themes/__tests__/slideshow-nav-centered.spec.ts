/**
 * «Слайд-шоу» bloom и flux: стрелки и нумерация (пагинация) должны стоять по
 * центру, как в rose (эталон проекта), а не быть прижаты к правому краю.
 *
 * ЖАЛОБА ВЛАДЕЛЬЦА (баг b71, 2026-09-17, дословно): «На блуме и флюкс стрелки
 * справа, а не по центру» / «съехали пункты, какой там элемент слайд-шоу
 * первый, второй, третий — они справа, а не по центру» / «нумерация при
 * добавлении медиа уезжает».
 *
 * ЗАМЕР ДО ПРАВКИ (рендер dist/theme-sections/<тема>, node-html-parser,
 * б/браузера — класс в разметке = класс, который увидит покупатель):
 *
 *   bloom:
 *     EMPTY (slides:[])       pagination: "absolute bottom-5 left-1/2 …
 *                              -translate-x-1/2 …"           — ЦЕНТР (ок)
 *     WITH_IMAGE (2 слайда)   pagination: "absolute bottom-5 right-4 …
 *                              md:right-20 2xl:right-[300px]" — ПРАВЫЙ КРАЙ (баг)
 *     → ровно «уезжает при добавлении медиа», как в жалобе.
 *   flux:
 *     EMPTY                  pagination: "absolute bottom-5 right-4
 *                              md:right-20 2xl:right-80 …"    — ПРАВЫЙ КРАЙ (баг)
 *     WITH_IMAGE              pagination: та же right-* группа — ПРАВЫЙ КРАЙ (баг)
 *     → едет вправо в ОБОИХ состояниях (navEdgeCls).
 *
 *   Стрелки (data-slide-prev/next) в обеих темах уже совпадали с rose
 *   (absolute left-4/right-4 top-1/2 …-translate-y-1/2) — сторожим тут же,
 *   чтобы будущая правка их не сдвинула.
 *
 * ПОСЛЕ ПРАВКИ: пагинация в обоих состояниях обеих тем — "left-1/2 …
 * -translate-x-1/2" (тот же класс, что уже жил в пустом состоянии bloom и
 * в rose), без каких-либо "right-*" классов.
 *
 * Требует сборки (гоча замера): pnpm build && pnpm build:blocks &&
 * pnpm build:theme-sections:all (иначе рендерер читает старый dist и врёт
 * зелёным по правленному исходнику).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");

const WITH_IMAGE = [
  { id: "s1", imageUrl: "/placeholders/landscape-slideshow.png", heading: "Заголовок 1" },
  { id: "s2", imageUrl: "/placeholders/landscape-slideshow.png", heading: "Заголовок 2" },
];

function renderSlideshow(theme: string, slides: unknown[]): HTMLElement {
  const jobs = [
    {
      block: "Slideshow",
      cascade: true,
      live: true,
      props: {
        id: "b71-slideshow-guard",
        slides,
        interval: 5,
        autoplay: true,
        padding: { top: 0, bottom: 0 },
      },
    },
  ];
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const row = (JSON.parse(raw) as Record<string, string>[])[0];
  if (row.html === undefined) {
    throw new Error(`рендер Slideshow (${theme}) не дал HTML: ${JSON.stringify(row).slice(0, 300)}`);
  }
  return parse(row.html) as unknown as HTMLElement;
}

/** Блок пагинации — единственный `div`/контейнер с `bottom-` в классе. */
function paginationOf(root: HTMLElement): HTMLElement {
  const candidates = root
    .querySelectorAll("div")
    .filter((d) => /\bbottom-/.test(d.getAttribute("class") ?? ""));
  expect(candidates.length).toBeGreaterThanOrEqual(1);
  return candidates[0] as HTMLElement;
}

describe.each(["bloom", "flux"] as const)("%s Slideshow: навигация по центру (баг b71)", (theme) => {
  describe.each([
    ["EMPTY", [] as unknown[]],
    ["WITH_IMAGE", WITH_IMAGE],
  ] as const)("%s", (_label, slides) => {
    const root = renderSlideshow(theme, slides);

    it("пагинация центрирована (left-1/2 + -translate-x-1/2), НЕ прижата к правому краю", () => {
      const cls = paginationOf(root).getAttribute("class") ?? "";
      expect(cls).toMatch(/\bleft-1\/2\b/);
      expect(cls).toMatch(/-translate-x-1\/2/);
      // Баг b71: любой `right-<n>` (в т.ч. брейкпоинтные md:/2xl:) на контейнере
      // пагинации — это откат к прижатию вправо.
      expect(cls).not.toMatch(/(^|\s)(?:[a-z0-9]+:)?right-/);
    });
  });

  it("стрелки (prev/next) вертикально центрированы у краёв — как rose (не трогаем)", () => {
    const root = renderSlideshow(theme, WITH_IMAGE);
    const prev = root.querySelector("[data-slide-prev]");
    const next = root.querySelector("[data-slide-next]");
    expect(prev).toBeTruthy();
    expect(next).toBeTruthy();
    const prevCls = prev!.getAttribute("class") ?? "";
    const nextCls = next!.getAttribute("class") ?? "";
    expect(prevCls).toMatch(/\bleft-4\b/);
    expect(prevCls).toMatch(/\btop-1\/2\b/);
    expect(prevCls).toMatch(/-translate-y-1\/2/);
    expect(nextCls).toMatch(/\bright-4\b/);
    expect(nextCls).toMatch(/\btop-1\/2\b/);
    expect(nextCls).toMatch(/-translate-y-1\/2/);
  });
});
