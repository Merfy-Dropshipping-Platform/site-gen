/**
 * `themes.list` (шлюз `GET /api/themes`) отдаёт каталог тем (этап 3, кусок
 * 3.4, И5): пять тем с «подходит для» и превью; `default` (строка миграции
 * 0002, пакета витрины нет) скрыт. Поля ответа, которые кабинет читает
 * сегодня, остаются на месте.
 */
import { ThemesService } from "../themes.service";
import { ThemesMicroserviceController } from "../themes.microservice.controller";

function row(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    slug: id,
    description: `описание ${id}`,
    previewDesktop: `/img/${id}.png`,
    previewMobile: `/img/${id}_m.png`,
    templateId: `${id}-1.0`,
    price: 0,
    tags: ["#тег"],
    badge: null,
    author: "merfy",
    viewCount: 3,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    fitsFor: [`для ${id}`],
    ownerTenantId: null,
    baseThemeId: null,
    isActive: true,
    ...extra,
  };
}

const ROWS = ["rose", "default", "flux", "satin", "bloom", "vanilla"].map(
  (id) => row(id),
);

/** `select().from()` ждут напрямую (все строки) или через `.where()` (активные). */
function dbReturning(rows: Array<{ isActive?: boolean }>) {
  const from = () => {
    const all: any = Promise.resolve(rows);
    all.where = async () => rows.filter((r) => r.isActive !== false);
    return all;
  };
  return { select: () => ({ from }) };
}

describe("ThemesService.list — каталог тем", () => {
  it("пять тем с «подходит для» и превью, без default", async () => {
    const service = new ThemesService(dbReturning(ROWS) as any);

    const { items } = await service.list();

    expect(items.map((t) => t.id)).toEqual([
      "rose",
      "flux",
      "satin",
      "bloom",
      "vanilla",
    ]);
    for (const item of items) {
      expect(item.fitsFor.length).toBeGreaterThan(0);
      expect(item.previewDesktop).toBeTruthy();
      expect(item.previewMobile).toBeTruthy();
    }
  });

  it("поля, которые кабинет читает сегодня, — на месте", async () => {
    const service = new ThemesService(dbReturning(ROWS) as any);
    const { items } = await service.list();
    expect(items[0]).toMatchObject({
      id: "rose",
      name: "rose",
      slug: "rose",
      description: "описание rose",
      previewDesktop: "/img/rose.png",
      previewMobile: "/img/rose_m.png",
      templateId: "rose-1.0",
      price: 0,
      tags: ["#тег"],
      author: "merfy",
      viewCount: 3,
    });
  });
});

describe("RPC themes.list", () => {
  it("по умолчанию — каталог (без default); явный isActive:false — все строки таблицы, как раньше", async () => {
    const controller = new ThemesMicroserviceController(
      new ThemesService(dbReturning(ROWS) as any),
    );

    const catalog = await controller.listThemes({});
    const raw = await controller.listThemes({ isActive: false });

    expect(catalog.success).toBe(true);
    expect((catalog as any).items.map((t: any) => t.id)).toEqual([
      "rose",
      "flux",
      "satin",
      "bloom",
      "vanilla",
    ]);
    expect((raw as any).items.map((t: any) => t.id)).toContain("default");
  });
});
