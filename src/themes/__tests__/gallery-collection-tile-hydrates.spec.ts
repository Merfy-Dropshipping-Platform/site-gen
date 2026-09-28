import { renderSections } from "../../../scripts/qa/lib/render";

/**
 * «Галерея»: плитка «Коллекция» с выбранной коллекцией получает фото коллекции.
 *
 * Тестер 24.09 (bloom): «у Галереи не применяется фото коллекции для параметра
 * Коллекция». Фото подставляет гидрация (data-gallery-collection → src у
 * <img> плитки), а серверная отрисовка вставляла <img> только при известном
 * адресе — у коллекции его нет до гидрации, и подставлять было некуда. Та же
 * дыра найдена в rose (разбор цели 24.09). Сторож на все пять тем: у плитки с
 * выбранной коллекцией в разметке есть <img>, куда гидрация положит фото.
 */
const THEMES = ["bloom", "rose", "flux", "vanilla", "satin"] as const;
// Коллекция есть в каталоге сборки: satin подставляет её фото уже при
// отрисовке, bloom/rose/flux/vanilla — гидрацией. Оба пути обязаны оставить в
// плитке <img>.
const КАТАЛОГ = {
  products: [],
  collections: [{ id: "col-1", slug: "col-1", name: "Коллекция", image: "/images/col.webp", images: ["/images/col.webp"] }],
  publications: [],
};

/** Разметка плитки с data-gallery-collection="col-1" (от открывающего тега до закрывающего </a>). */
function collectionTile(html: string): string {
  const start = html.indexOf('data-gallery-collection="col-1"');
  if (start < 0) return "";
  const open = html.lastIndexOf("<", start);
  const end = html.indexOf("</a>", start);
  return html.slice(open, end < 0 ? undefined : end);
}

describe("«Галерея»: плитка коллекции готова принять фото коллекции", () => {
  for (const theme of THEMES) {
    for (const [место, items] of [
      ["боковая плитка", [{ type: "image", url: "/images/a.webp" }, { type: "product" }, { type: "collection", collectionId: "col-1" }]],
      ["большая плитка", [{ type: "collection", collectionId: "col-1" }, { type: "product" }, { type: "image", url: "/images/a.webp" }]],
    ] as const) {
      it(`${theme}: ${место}`, () => {
        const [r] = renderSections(theme, [
          { block: "Gallery", props: { id: "Gallery-1", items: items as unknown as Record<string, unknown>[] }, catalog: КАТАЛОГ },
        ]);
        expect(r.error).toBeUndefined();
        const tile = collectionTile(r.html ?? "");
        expect(tile).not.toBe("");
        expect(tile).toMatch(/<img\b/);
      });
    }
  }
});
