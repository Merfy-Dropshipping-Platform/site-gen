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
});
