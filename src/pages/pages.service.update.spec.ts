import { NotFoundException } from "@nestjs/common";
import { PagesService } from "./pages.service";

/**
 * Юнит-тесты PagesService.updatePage (Phase 3 — per-page SEO). Ручной db-мок:
 * select site → select revision → update. updatePage резолвера НЕ вызывает.
 */
function makeDb(siteRow: any, revRow: any) {
  const captured: { data?: any } = {};
  const selectResults = [siteRow ? [siteRow] : [], revRow ? [revRow] : []];
  let i = 0;
  const db: any = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(selectResults[i++] ?? []),
      }),
    }),
    update: () => ({
      set: (u: any) => {
        captured.data = u.data;
        return { where: () => Promise.resolve() };
      },
    }),
  };
  return { db, captured };
}

const site = {
  id: "s1",
  tenantId: "t1",
  currentRevisionId: "r1",
  status: "published",
  themeId: "rose",
};
const revWith = (pages: any[]) => ({
  id: "r1",
  data: { pages, pagesData: {}, lockVersion: 3 },
});

describe("PagesService.updatePage", () => {
  it("deep-merge seo по ключам + patch name + lockVersion+1", async () => {
    const { db, captured } = makeDb(
      site,
      revWith([{ id: "pg", name: "Old", seo: { title: "t", description: "keep" } }]),
    );
    const svc = new PagesService(db);

    const res: any = await svc.updatePage({
      tenantId: "t1",
      siteId: "s1",
      pageId: "pg",
      seo: { title: "new" }, // только title
      name: "New name",
    });

    // соседний seo-ключ (description) сохранён
    expect(res.page.seo).toEqual({ title: "new", description: "keep" });
    expect(res.page.name).toBe("New name");
    expect(captured.data.lockVersion).toBe(4);
    expect(captured.data.pages[0].seo).toEqual({ title: "new", description: "keep" });
  });

  it("seo при отсутствии существующего seo просто кладётся", async () => {
    const { db, captured } = makeDb(site, revWith([{ id: "pg", name: "P", seo: null }]));
    const svc = new PagesService(db);
    await svc.updatePage({ tenantId: "t1", siteId: "s1", pageId: "pg", seo: { title: "X", keywords: "k" } });
    expect(captured.data.pages[0].seo).toEqual({ title: "X", keywords: "k" });
  });

  it("страница не найдена → NotFoundException(page_not_found)", async () => {
    const { db } = makeDb(site, revWith([{ id: "other" }]));
    const svc = new PagesService(db);
    await expect(
      svc.updatePage({ tenantId: "t1", siteId: "s1", pageId: "pg", seo: { title: "x" } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("сайт не найден (чужой tenant) → NotFoundException(site_not_found)", async () => {
    const { db } = makeDb(null, null);
    const svc = new PagesService(db);
    await expect(
      svc.updatePage({ tenantId: "t1", siteId: "s1", pageId: "pg", seo: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("content → тело секции «Страница» в pagesData; heading = name; соседние блоки целы", async () => {
    const rev = {
      id: "r1",
      data: {
        pages: [{ id: "pg", name: "Old", seo: null }],
        pagesData: {
          pg: {
            content: [
              { type: "Header", props: { id: "h" } },
              { type: "Page", props: { pageId: "", heading: "", content: "" } },
              { type: "Footer", props: { id: "f" } },
            ],
            root: { props: {} },
            zones: {},
          },
        },
        lockVersion: 3,
      },
    };
    const { db, captured } = makeDb(site, rev);
    const svc = new PagesService(db);

    await svc.updatePage({
      tenantId: "t1",
      siteId: "s1",
      pageId: "pg",
      name: "Privacy",
      content: "<p>Тело страницы</p>",
    });

    const blocks = captured.data.pagesData.pg.content;
    const pageBlock = blocks.find((b: any) => b.type === "Page");
    expect(pageBlock.props.content).toBe("<p>Тело страницы</p>");
    expect(pageBlock.props.heading).toBe("Privacy");
    // Header/Footer не тронуты
    expect(blocks[0].type).toBe("Header");
    expect(blocks[2].type).toBe("Footer");
    expect(captured.data.lockVersion).toBe(4);
  });

  it("D4: content, но в pagesData[pageId] нет блока Page → блок вставлен перед Footer, тело не потеряно", async () => {
    const rev = {
      id: "r1",
      data: {
        pages: [{ id: "pg", name: "Политика", seo: null }],
        pagesData: {
          pg: {
            content: [
              { type: "Header", props: { id: "h" } },
              { type: "Footer", props: { id: "f" } },
            ],
            root: { props: {} },
            zones: {},
          },
        },
        lockVersion: 3,
      },
    };
    const { db, captured } = makeDb(site, rev);
    const svc = new PagesService(db);

    await svc.updatePage({
      tenantId: "t1",
      siteId: "s1",
      pageId: "pg",
      content: "<p>Восстановленное тело</p>",
    });

    const blocks = captured.data.pagesData.pg.content;
    // Порядок: Header → Page (вставлен) → Footer.
    expect(blocks.map((b: any) => b.type)).toEqual(["Header", "Page", "Footer"]);
    const pageBlock = blocks.find((b: any) => b.type === "Page");
    expect(pageBlock.props.content).toBe("<p>Восстановленное тело</p>");
    // heading берётся из существующего имени страницы (в патче name нет).
    expect(pageBlock.props.heading).toBe("Политика");
    expect(captured.data.lockVersion).toBe(4);
  });

  it("D4: content, но pagesData без ключа страницы → создаётся Puck-дерево с секцией Page", async () => {
    const rev = {
      id: "r1",
      data: {
        pages: [{ id: "pg", name: "Оферта", seo: null }],
        pagesData: {},
        lockVersion: 3,
      },
    };
    const { db, captured } = makeDb(site, rev);
    const svc = new PagesService(db);

    await svc.updatePage({
      tenantId: "t1",
      siteId: "s1",
      pageId: "pg",
      name: "Публичная оферта",
      content: "<p>Текст оферты</p>",
    });

    const entry = captured.data.pagesData.pg;
    expect(entry.content.map((b: any) => b.type)).toEqual([
      "Header",
      "Page",
      "Footer",
    ]);
    const pageBlock = entry.content.find((b: any) => b.type === "Page");
    expect(pageBlock.props.content).toBe("<p>Текст оферты</p>");
    // heading из name в патче (приоритет над существующим именем).
    expect(pageBlock.props.heading).toBe("Публичная оферта");
    expect(pageBlock.props.headingSize).toBe("medium");
    expect(entry.root.props.title).toBe("Публичная оферта");
    expect(entry.zones).toEqual({});
    expect(captured.data.lockVersion).toBe(4);
  });

  it("чистый SEO-патч не трогает тело секции «Страница»", async () => {
    const rev = {
      id: "r1",
      data: {
        pages: [{ id: "pg", name: "P", seo: null }],
        pagesData: {
          pg: { content: [{ type: "Page", props: { content: "keep" } }] },
        },
        lockVersion: 1,
      },
    };
    const { db, captured } = makeDb(site, rev);
    const svc = new PagesService(db);

    await svc.updatePage({
      tenantId: "t1",
      siteId: "s1",
      pageId: "pg",
      seo: { title: "x" },
    });

    const pageBlock = captured.data.pagesData.pg.content.find(
      (b: any) => b.type === "Page",
    );
    expect(pageBlock.props.content).toBe("keep");
  });
});
