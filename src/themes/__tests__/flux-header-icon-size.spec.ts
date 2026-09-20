import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Жалоба владельца 20.09 по flux — та же по смыслу, что и по bloom: иконки в
 * шапке крупные.
 *
 * Замер перед правкой (рендер настоящего скомпилированного модуля):
 *   flux    кнопка 44px, иконка 32px   ← единственная тема крупнее 24px
 *   rose    кнопка 32px, иконка 24px
 *   bloom   кнопка 32px, иконка 20px
 * Причём у самого flux мобильный ряд всегда нёс 24px — крупнее была только
 * десктопная строка.
 *
 * Правка трогает ТОЛЬКО содержимое кнопки. Кликабельная область 44px (size-11)
 * — требование эталона верстальщиков, его отдельно сторожит
 * scripts/__tests__/flux-header-reference-contract.test.mjs; здесь оно
 * продублировано, чтобы уменьшение иконки никогда не утянуло за собой кнопку.
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const HEADER_SRC = resolve(__dirname, "..", "..", "..", "themes", "flux", "src", "components", "Header.astro");
const WISHLIST_SRC = resolve(__dirname, "..", "..", "..", "themes", "flux", "src", "components", "FluxWishlistLink.astro");

const LINKS = [
  { text: "Главная", href: "/" },
  { text: "Каталог", href: "/catalog" },
];

function renderHeader(logoPosition: string): string {
  const props = {
    id: "Header-1",
    colorScheme: "1",
    logoPosition,
    padding: { top: 12, bottom: 12 },
    navigationLinks: LINKS,
    links: LINKS,
  };
  const out = execFileSync(
    "node",
    [RENDERER, "flux", JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`flux/${logoPosition}: ${res.error}`);
  return res.html ?? "";
}

const LAYOUTS = ["top-left", "top-center", "center-left", "center-absolute"];

describe("шапка flux: иконка действия — 24px", () => {
  it.each(LAYOUTS)("%s: в отрисованной шапке нет иконок size-8", (layout) => {
    const html = renderHeader(layout);
    expect(html).toMatch(/size-6/);
    // 32px-иконка вернуться не должна ни в одной раскладке
    expect(html).not.toMatch(/pointer-events-none size-8/);
  });

  it("исходник порта не несёт sizeClass=\"size-8\"", () => {
    expect(readFileSync(HEADER_SRC, "utf8")).not.toMatch(/sizeClass="size-8"/);
  });

  it("у избранного дефолтный размер иконки тоже 24px", () => {
    expect(readFileSync(WISHLIST_SRC, "utf8")).toMatch(/iconSize = "size-6"/);
  });
});

describe("шапка flux: кликабельная область осталась 44px", () => {
  it.each(LAYOUTS)("%s: кнопки действий несут size-11", (layout) => {
    const html = renderHeader(layout);
    expect(html).toMatch(/size-11/);
  });

  it("исходник порта сохраняет контейнеры size-11 (требование эталона)", () => {
    const src = readFileSync(HEADER_SRC, "utf8");
    const boxes = src.match(/class="(?:relative )?flex size-11 items-center justify-center/g) ?? [];
    expect(boxes.length).toBeGreaterThanOrEqual(8);
    expect(src).not.toMatch(/class="(?:relative )?flex size-8 items-center justify-center/);
  });
});
