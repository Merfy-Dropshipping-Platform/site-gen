import { ForbiddenException } from "@nestjs/common";
import { PagesService } from "./pages.service";

/**
 * Страницы магазина новой темы (блок 1 «Секций и SDK», часть 4, Р1-4-13): создание пишет строку страницы, секцию с
 * "newPage" и пункт в конец меню main; удаление убирает страницу, её секции и её пункты из всех меню. Главную удалить
 * нельзя. Ручной db-мок, как в pages.service.update.spec.ts; запись — через порт StoreContent.
 */
const SITE = {
  id: "s1",
  tenantId: "t1",
  currentRevisionId: "r1",
  status: "published",
  themeId: "nova",
};
const SECTIONS = {
  sections: [
    { name: "shop:hero", title: "Первый экран", settings: [] },
    {
      name: "shop:page",
      title: "Страница",
      settings: [
        {
          id: "heading",
          label: "Заголовок",
          setting: { kind: "string", default: "" },
        },
      ],
      newPage: "heading",
    },
  ],
};
const MAIN = {
  id: "main",
  title: "Главное меню",
  items: [{ label: "Каталог", url: "/catalog" }],
};

function serviceOf(
  revData: any,
  builderBody: unknown = SECTIONS,
  builderStatus = 200,
  newTheme = true,
) {
  const captured: { data?: any } = {};
  const db: any = {
    select: () => ({ from: () => ({ where: () => Promise.resolve([SITE]) }) }),
  };
  const storeContent: any = {
    load: jest.fn(async () => ({ document: revData, version: "r1" })),
    save: jest.fn(async (_siteId: string, params: any) => {
      captured.data = params.document;
      return { version: "r2" };
    }),
  };
  const handoff: any = { isNewTheme: jest.fn(async () => newTheme) };
  const builder: any = {
    call: jest.fn(async () => ({
      status: builderStatus,
      contentType: "application/json",
      body: JSON.stringify(builderBody),
    })),
  };
  return {
    svc: new PagesService(db, storeContent, handoff, builder),
    captured,
    builder,
  };
}

const create = (svc: PagesService, name: string, slug: string) =>
  svc.createPage({ tenantId: "t1", siteId: "s1", name, slug }) as Promise<any>;
const remove = (svc: PagesService, pageId: string) =>
  svc.deletePage({ tenantId: "t1", siteId: "s1", pageId }) as Promise<any>;

describe("PagesService: страницы новой темы", () => {
  it("создание: строка страницы, «Страница» с именем, пустое дерево Puck, пункт в конце main; ответ — страница, секции, меню", async () => {
    const { svc, captured, builder } = serviceOf({
      pages: [],
      pagesData: {},
      sections: { home: [] },
      menus: [MAIN],
    });
    const res = await create(svc, "О нас", "/o-nas");
    const id = res.page.id;
    expect(id).toMatch(/^page-custom-[0-9a-f-]{36}$/);
    expect(res.page).toMatchObject({
      name: "О нас",
      slug: "/o-nas",
      role: "custom",
      isCustom: true,
    });
    expect(builder.call).toHaveBeenCalledWith("/sections", { shop: "s1" });
    const placed = captured.data.sections[id];
    expect(placed).toEqual([
      {
        id: expect.stringMatching(/^page-[a-z0-9]{8}$/),
        section: "shop:page",
        settings: { heading: "О нас" },
      },
    ]);
    expect(res.sections).toEqual({ [id]: placed });
    expect(captured.data.pagesData[id]).toEqual({
      content: [],
      root: { props: { title: "О нас" } },
      zones: {},
    });
    expect(captured.data.menus).toEqual([
      { ...MAIN, items: [...MAIN.items, { label: "О нас", url: "/o-nas" }] },
    ]);
    expect(res.menus).toEqual(captured.data.menus);
    expect(captured.data.sections.home).toEqual([]);
  });

  it("меню main нет — создаётся «Главное меню»; секции с newPage нет или сборщик не ответил — секций нет", async () => {
    const first = serviceOf(
      { pages: [], pagesData: {} },
      { sections: [SECTIONS.sections[0]] },
    );
    const res = await create(first.svc, "Доставка", "/dostavka");
    expect(first.captured.data.menus).toEqual([
      {
        id: "main",
        title: "Главное меню",
        items: [{ label: "Доставка", url: "/dostavka" }],
      },
    ]);
    expect(res.sections).toEqual({ [res.page.id]: [] });
    const silent = serviceOf(
      { pages: [], pagesData: {} },
      "сборщик не ответил",
      502,
    );
    const other = await create(silent.svc, "Оплата", "/oplata");
    expect(other.sections).toEqual({ [other.page.id]: [] });
  });

  it("адрес: не по правилу — slug_invalid, стенд темы — slug_collides_with_system_page, повтор и / — slug_already_in_use", async () => {
    const rev = {
      pages: [
        { id: "page-custom-1", name: "О нас", slug: "/o-nas", role: "custom" },
      ],
      pagesData: {},
    };
    for (const slug of ["/О-нас", "o-nas", "/o--nas", "/O-nas"])
      await expect(create(serviceOf(rev).svc, "Х", slug)).rejects.toMatchObject(
        { message: "slug_invalid" },
      );
    await expect(
      create(serviceOf(rev).svc, "Х", "/theme-stand"),
    ).rejects.toMatchObject({
      message: "slug_collides_with_system_page",
    });
    await expect(
      create(serviceOf(rev).svc, "Х", "/o-nas"),
    ).rejects.toMatchObject({ message: "slug_already_in_use" });
  });

  it("удаление: строка, дерево, секции страницы и её пункты во всех меню с подпунктами; открытая страница — главная", async () => {
    const rev = {
      pages: [
        { id: "page-custom-1", name: "О нас", slug: "/o-nas", role: "custom" },
      ],
      pagesData: { "page-custom-1": { content: [] } },
      sections: {
        home: [],
        "page-custom-1": [{ id: "page-1", section: "shop:page", settings: {} }],
      },
      menus: [
        {
          ...MAIN,
          items: [
            ...MAIN.items,
            {
              label: "О нас",
              url: "/o-nas",
              items: [{ label: "Команда", url: "/team" }],
            },
          ],
        },
        {
          id: "footer",
          title: "Подвал",
          items: [
            {
              label: "Компания",
              url: "/company",
              items: [{ label: "О нас", url: "/o-nas" }],
            },
          ],
        },
      ],
      currentPageId: "page-custom-1",
    };
    const { svc, captured } = serviceOf(rev);
    const res = await remove(svc, "page-custom-1");
    expect(captured.data.pages).toEqual([]);
    expect(captured.data.pagesData).toEqual({});
    expect(captured.data.sections).toEqual({ home: [] });
    expect(captured.data.menus).toEqual([
      MAIN,
      {
        id: "footer",
        title: "Подвал",
        items: [{ label: "Компания", url: "/company", items: [] }],
      },
    ]);
    expect(captured.data.currentPageId).toBe("home");
    expect(res).toEqual({
      deleted: "page-custom-1",
      menus: captured.data.menus,
    });
  });

  it("главную удалить нельзя — cannot_delete_system_page", async () => {
    const rev = {
      pages: [{ id: "home", name: "Главная", slug: "/" }],
      pagesData: {},
      sections: { home: [] },
    };
    await expect(remove(serviceOf(rev).svc, "home")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      remove(serviceOf({ pages: [], pagesData: {} }).svc, "home"),
    ).rejects.toMatchObject({
      message: "cannot_delete_system_page",
    });
  });

  it("пять тем — прежний путь: шапка, «Страница» и подвал в дереве Puck, без секций и меню", async () => {
    const { svc, captured, builder } = serviceOf(
      { pages: [], pagesData: {} },
      SECTIONS,
      200,
      false,
    );
    const res = await create(svc, "О нас", "/o-nas");
    expect(
      captured.data.pagesData[res.page.id].content.map(
        (block: any) => block.type,
      ),
    ).toEqual(["Header", "Page", "Footer"]);
    expect(captured.data.menus).toBeUndefined();
    expect(builder.call).not.toHaveBeenCalled();
  });
});
