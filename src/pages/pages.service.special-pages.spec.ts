import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PagesService } from "./pages.service";

// Особые страницы новой темы в страницах магазина (блок 7 «Секций и SDK», часть 7а): адреса особых страниц заняты,
// удалить их нельзя, список страниц отдаёт их и у ревизии, созданной до части 7а. Ручной db-мок, как в
// pages.service.new-theme.spec.ts.
const SITE = {
  id: "s1",
  tenantId: "t1",
  currentRevisionId: "r1",
  status: "published",
  themeId: "nova",
};
const HOME = {
  id: "home",
  name: "Главная",
  slug: "/",
  role: "system",
  isCustom: false,
};
const NOT_FOUND = {
  id: "not-found",
  name: "Страница 404",
  slug: "/404",
  role: "system",
  isCustom: false,
};

function serviceOf(revData: any) {
  const db: any = {
    select: () => ({ from: () => ({ where: () => Promise.resolve([SITE]) }) }),
  };
  const storeContent: any = {
    load: jest.fn(async () => ({ document: revData, version: "r1" })),
    save: jest.fn(async () => ({ version: "r2" })),
  };
  const handoff: any = { isNewTheme: jest.fn(async () => true) };
  const builder: any = {
    call: jest.fn(async () => ({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sections: [] }),
    })),
  };
  return {
    svc: new PagesService(db, storeContent, handoff, builder),
    storeContent,
  };
}

describe("PagesService: особые страницы новой темы", () => {
  it("адрес /404 занят — slug_collides_with_system_page, ничего не записано", async () => {
    const { svc, storeContent } = serviceOf({
      pages: [HOME],
      pagesData: {},
      sections: {},
    });
    await expect(
      svc.createPage({
        tenantId: "t1",
        siteId: "s1",
        name: "Ошибка",
        slug: "/404",
      }),
    ).rejects.toThrow(
      new BadRequestException("slug_collides_with_system_page"),
    );
    expect(storeContent.save).not.toHaveBeenCalled();
  });

  it("«Страницу 404» удалить нельзя — и когда её строки в ревизии ещё нет", async () => {
    for (const pages of [[HOME, NOT_FOUND], [HOME]]) {
      const { svc, storeContent } = serviceOf({
        pages,
        pagesData: {},
        sections: {},
      });
      await expect(
        svc.deletePage({ tenantId: "t1", siteId: "s1", pageId: "not-found" }),
      ).rejects.toThrow(new ForbiddenException("cannot_delete_system_page"));
      expect(storeContent.save).not.toHaveBeenCalled();
    }
  });

  it("список страниц: ревизия до части 7а — «Страница 404» есть, системная, не своя", async () => {
    const { svc } = serviceOf({ pages: [HOME], pagesData: {} });
    const { pages } = await svc.listPages({ tenantId: "t1", siteId: "s1" });
    expect(
      pages.map((page: any) => [page.id, page.role, page.isCustom, page.path]),
    ).toEqual([
      ["home", "system", false, "/"],
      ["product", "system", false, "/product/:slug"],
      ["collection", "system", false, "/collections/:slug"],
      ["catalog", "system", false, "/catalog"],
      ["blog", "system", false, "/blogs/:slug"],
      ["article", "system", false, "/blogs/:blog/:slug"],
      ["policy", "system", false, "/legal/:slug"],
      ["not-found", "system", false, "/404"],
    ]);
  });
});

describe("PagesService: шаблоны записей новой темы (блок 8 «Секций и SDK», часть 8б)", () => {
  it("адреса /product, /collections, /blogs и /legal заняты — slug_collides_with_system_page", async () => {
    for (const slug of ["/product", "/collections", "/blogs", "/legal"]) {
      const { svc, storeContent } = serviceOf({
        pages: [HOME],
        pagesData: {},
        sections: {},
      });
      await expect(
        svc.createPage({ tenantId: "t1", siteId: "s1", name: "Своя", slug }),
      ).rejects.toThrow(
        new BadRequestException("slug_collides_with_system_page"),
      );
      expect(storeContent.save).not.toHaveBeenCalled();
    }
  });

  it("шаблон записи удалить нельзя — и когда его строки в ревизии ещё нет", async () => {
    const { svc, storeContent } = serviceOf({
      pages: [HOME],
      pagesData: {},
      sections: {},
    });
    await expect(
      svc.deletePage({ tenantId: "t1", siteId: "s1", pageId: "product" }),
    ).rejects.toThrow(new ForbiddenException("cannot_delete_system_page"));
    expect(storeContent.save).not.toHaveBeenCalled();
  });
});
