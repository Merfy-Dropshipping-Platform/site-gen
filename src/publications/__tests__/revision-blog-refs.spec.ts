/**
 * Перевод секции «Публикации» в ревизии: категория → id блога (правила прежней
 * миграции 0028 — те же случаи, что были у её теста на Postgres).
 */
import {
  LEGACY_PUBLICATIONS_PATTERN,
  translatePublicationsBlogRefs,
} from "../revision-blog-refs";

type Block = { type: string; props: Record<string, unknown> };
const pub = (id: string, props: Record<string, unknown>): Block => ({
  type: "Publications",
  props: { id, ...props },
});

/** Ревизия «как в базе»: секции на страницах, в зоне и в корневом content. */
function revision(blocks: Block[]) {
  return {
    pages: [{ id: "home", slug: "/" }],
    pagesData: {
      home: {
        content: [
          { type: "Hero", props: { id: "Hero-1", heading: "news" } },
          ...blocks,
        ] as Block[],
        root: { props: {} },
        zones: {
          "Columns-1:left": [pub("Pub-zone", { publicationType: "blog" })],
        },
      },
    },
    content: [
      pub("Pub-root", { categoryFilter: "Статьи", publicationType: "" }),
    ],
  };
}

const S1 = { novosti: "s1-novosti", stati: "s1-stati", blog: "s1-blog" };
const S2 = { novosti: "s2-novosti" };

const homeBlock = (data: ReturnType<typeof revision>, id: string) =>
  data.pagesData.home.content.find((b) => b.props.id === id)!;

function r1() {
  return revision([
    pub("Pub-news", { publicationType: "news", categoryFilter: "all" }),
    pub("Pub-articles", { publicationType: "articles" }),
    pub("Pub-all", { publicationType: "all" }),
    pub("Pub-one", { publicationType: "pub-123" }),
    pub("Pub-new", {
      publicationSource: "publication",
      publicationId: "pub-9",
      publicationType: "news",
    }),
  ]);
}

describe("translatePublicationsBlogRefs — категории секции «Публикации» → id блогов", () => {
  it("news → «Новости», articles → «Статьи» этого магазина; categoryFilter 'all' остаётся", () => {
    const { data } = translatePublicationsBlogRefs(r1(), S1);
    expect(homeBlock(data, "Pub-news").props).toEqual({
      id: "Pub-news",
      publicationSource: "blog",
      blogId: "s1-novosti",
      publicationType: "s1-novosti",
      categoryFilter: "all",
    });
    expect(homeBlock(data, "Pub-articles").props).toEqual(
      expect.objectContaining({
        publicationSource: "blog",
        blogId: "s1-stati",
        publicationType: "s1-stati",
      }),
    );
  });

  it("секции в зонах и в корневом content тоже переведены (blog, «Статьи» в categoryFilter)", () => {
    const { data } = translatePublicationsBlogRefs(r1(), S1);
    expect(data.pagesData.home.zones["Columns-1:left"][0].props).toEqual(
      expect.objectContaining({ publicationSource: "blog", blogId: "s1-blog" }),
    );
    expect(data.content[0].props).toEqual(
      expect.objectContaining({
        blogId: "s1-stati",
        categoryFilter: "s1-stati",
        publicationType: "s1-stati",
      }),
    );
  });

  it("регистр и пробелы прежней категории не важны", () => {
    const { data } = translatePublicationsBlogRefs(
      {
        content: [
          pub("A", { publicationType: " NEWS " }),
          pub("B", { publicationType: "Блог" }),
        ],
      },
      S1,
    );
    expect(data.content.map((b) => b.props.blogId)).toEqual([
      "s1-novosti",
      "s1-blog",
    ]);
  });

  it("блога нет в магазине — блог по умолчанию «Новости»", () => {
    const { data } = translatePublicationsBlogRefs(
      revision([pub("Pub-articles", { publicationType: "articles" })]),
      S2,
    );
    expect(homeBlock(data, "Pub-articles").props).toEqual(
      expect.objectContaining({
        publicationSource: "blog",
        blogId: "s2-novosti",
      }),
    );
  });

  it("у магазина нет ни одного блога — ревизия не меняется", () => {
    const doc = revision([pub("Pub-news", { publicationType: "news" })]);
    const result = translatePublicationsBlogRefs(doc, {});
    expect(result.sections).toBe(0);
    expect(result.data).toBe(doc);
  });

  it("«Все публикации», выбранная запись, новый формат и чужие блоки не тронуты", () => {
    const { data } = translatePublicationsBlogRefs(r1(), S1);
    expect(homeBlock(data, "Pub-all").props).toEqual({
      id: "Pub-all",
      publicationType: "all",
    });
    expect(homeBlock(data, "Pub-one").props).toEqual({
      id: "Pub-one",
      publicationType: "pub-123",
    });
    expect(homeBlock(data, "Pub-new").props).toEqual({
      id: "Pub-new",
      publicationSource: "publication",
      publicationId: "pub-9",
      publicationType: "news",
    });
    expect(homeBlock(data, "Hero-1").props).toEqual({
      id: "Hero-1",
      heading: "news",
    });
    const empty = { pages: [], pagesData: {} };
    expect(translatePublicationsBlogRefs(empty, S1).data).toBe(empty);
  });

  it("считает переведённые секции и не мутирует вход", () => {
    const doc = r1();
    const snapshot = JSON.parse(JSON.stringify(doc));
    const { sections } = translatePublicationsBlogRefs(doc, S1);
    // Pub-news, Pub-articles, Pub-zone, Pub-root.
    expect(sections).toBe(4);
    expect(doc).toEqual(snapshot);
  });

  it("повторный перевод ничего не меняет", () => {
    const once = translatePublicationsBlogRefs(r1(), S1).data;
    const twice = translatePublicationsBlogRefs(once, S1);
    expect(twice.sections).toBe(0);
    expect(twice.data).toBe(once);
  });

  it("регулярка отбора: прежние категории — да, id блога и «все» — нет", () => {
    const re = new RegExp(LEGACY_PUBLICATIONS_PATTERN, "i");
    expect(re.test('{"publicationType": "news"}')).toBe(true);
    expect(re.test('{"categoryFilter":"Статьи"}')).toBe(true);
    expect(re.test('{"publicationType": "Blog"}')).toBe(true);
    expect(re.test('{"publicationType": "s1-blog"}')).toBe(false);
    expect(re.test('{"publicationType": "all"}')).toBe(false);
    expect(
      re.test(
        JSON.stringify(translatePublicationsBlogRefs(r1(), S1).data.content),
      ),
    ).toBe(false);
  });
});
