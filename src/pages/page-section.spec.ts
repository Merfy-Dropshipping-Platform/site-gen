/**
 * Секция «Страница» контент-страницы — одна форма на троих (ревью М2):
 * новая страница из кабинета (`PagesService.createPage`), тело страницы в
 * редакторе «Страницы» (`updatePage`), перенос легаси-страницы при смене темы
 * (`SetTheme`, Н9). Порядок ключей тот же, что был у каждой из копий: ревизия
 * хранится как JSON, и лишняя перестановка стала бы «правкой» для сравнений.
 */
import { emptyPageBlock } from "./page-section";

describe("emptyPageBlock", () => {
  it("без текста — ровно блок createPage", () => {
    expect(JSON.stringify(emptyPageBlock("page-custom-1"))).toBe(
      JSON.stringify({
        type: "Page",
        props: {
          id: "Page-page-custom-1",
          pageId: "",
          headingSize: "medium",
          colorScheme: "scheme-1",
          padding: { top: 80, bottom: 80 },
        },
      }),
    );
  });

  it("с заголовком и телом — ровно блок updatePage (и переноса легаси-страницы)", () => {
    expect(
      JSON.stringify(
        emptyPageBlock("p-1", { heading: "О нас", content: "<p>текст</p>" }),
      ),
    ).toBe(
      JSON.stringify({
        type: "Page",
        props: {
          id: "Page-p-1",
          pageId: "",
          heading: "О нас",
          content: "<p>текст</p>",
          headingSize: "medium",
          colorScheme: "scheme-1",
          padding: { top: 80, bottom: 80 },
        },
      }),
    );
  });

  it("каждый вызов — новый объект: правка одного блока не трогает другой", () => {
    const a = emptyPageBlock("a");
    const b = emptyPageBlock("a");
    (a.props.padding as { top: number }).top = 0;
    expect(b.props.padding).toEqual({ top: 80, bottom: 80 });
  });
});
