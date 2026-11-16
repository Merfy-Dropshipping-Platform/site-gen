/**
 * Проверка публикации на платформе (16.11): сервис (что изменилось → снимки → товары → решение) и `sites.publish`
 * (ошибка закрывает публикацию — и из MCP, и из кабинета; `skipChecks` — «опубликовать как есть»).
 */
import { of, throwError } from "rxjs";
import { SitesMicroserviceController } from "../../sites.microservice.controller";
import { blockedMessage, PublishCheckService } from "../publish-check.service";
import type { CheckScope } from "../../content/check-scope";
import type { LookJob, LookOutcome } from "../look.client";

const TENANT = "t-1";
const SITE = "site-1";

const SCOPE: CheckScope = {
  sections: [{ page: "home", id: "faq-1" }],
  pages: [],
  theme: false,
};

const brokenCart = {
  marks: {
    ok: true,
    results: [
      {
        mark: "add-to-cart",
        section: "faq-1",
        status: "broken",
        text: "запроса в корзину не было",
        device: "mobile",
      },
    ],
  },
  checks: { findings: [], failed: [] },
};
const emptyHeading = {
  marks: { ok: true, results: [] },
  checks: {
    findings: [
      {
        place: "html",
        check: "semantic",
        rule: "empty-heading",
        level: "warning",
        section: "faq-1",
        where: "h2",
        text: "Пустой h2 · заполни текст или убери заголовок",
        count: 1,
      },
    ],
    failed: [],
  },
};

interface Options {
  newTheme?: boolean;
  publishedRevisionId?: string | null;
  snapshot?: unknown;
  look?: (job: LookJob) => Promise<LookOutcome>;
  products?: () => unknown;
  scope?: () => Promise<CheckScope>;
}

function setup(options: Options = {}) {
  const site = {
    id: SITE,
    tenantId: TENANT,
    themeId: "nova",
    publicUrl: null,
    currentRevisionId: "r2",
    publishedRevisionId:
      options.publishedRevisionId === undefined
        ? "r1"
        : options.publishedRevisionId,
  };
  const updates: unknown[] = [];
  const db: any = {
    select: () => ({ from: () => ({ where: async () => [site] }) }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          updates.push(values);
        },
      }),
    }),
  };
  const content = {
    checkScopeBetween: jest.fn(options.scope ?? (async () => SCOPE)),
  };
  const products = {
    send: jest.fn(
      options.products ??
        (() => of({ success: true, data: [{ id: "p1" }], total: 12 })),
    ),
  };
  const jobs: LookJob[] = [];
  const looks = {
    look: jest.fn(async (job: LookJob): Promise<LookOutcome> => {
      jobs.push(job);
      if (options.look) return options.look(job);
      return { kind: "snapshot", snapshot: options.snapshot ?? emptyHeading };
    }),
  };
  const handoff = { isNewTheme: jest.fn(async () => options.newTheme ?? true) };
  const service = new PublishCheckService(
    db,
    content as any,
    products as any,
    looks as any,
    handoff as any,
  );
  return { service, content, products, looks, jobs, updates };
}

describe("проверка публикации · сервис", () => {
  it("смотрит изменённое с опубликованной ревизии: снимок главной по секции faq-1, оба устройства; семантика — предупреждение", async () => {
    const { service, content, jobs } = setup();
    const check = await service.check(TENANT, SITE);
    expect(content.checkScopeBetween).toHaveBeenCalledWith(
      SITE,
      "r1",
      "r2",
      expect.anything(),
    );
    expect(jobs).toEqual([
      {
        siteId: SITE,
        page: "home",
        devices: "both",
        full: false,
        clips: false,
        sections: ["faq-1"],
      },
    ]);
    expect(check).toMatchObject({
      since: "r1",
      revisionId: "r2",
      pages: ["home"],
      blocked: false,
      failed: [],
    });
    expect(check?.findings.map((item) => [item.rule, item.level])).toEqual([
      ["empty-heading", "warning"],
    ]);
  });

  it("сломанная метка в изменённой секции и пустой каталог — ошибки, публикация закрыта", async () => {
    const { service } = setup({
      snapshot: brokenCart,
      products: () => of({ success: true, data: [], total: 0 }),
    });
    const check = await service.check(TENANT, SITE);
    expect(check?.blocked).toBe(true);
    expect(
      check?.findings.map((item) => [
        item.place,
        item.check,
        item.rule,
        item.level,
      ]),
    ).toEqual([
      ["browser", "marks", "add-to-cart", "error"],
      ["shop", "catalog", "no-products", "error"],
    ]);
    expect(blockedMessage(check!)).toBe(
      [
        "Публикация остановлена: нужно починить 2",
        "• метка add-to-cart (секция faq-1): запроса в корзину не было · почини секцию или убери метку",
        "• каталог: в магазине нет товаров · добавьте товары в разделе «Товары»",
      ].join("\n"),
    );
  });

  it("сбои проверки — «не проверено», публикацию не закрывают: снимков нет, товары молчат, что изменилось — не посчиталось", async () => {
    const { service } = setup({
      look: async () => ({
        kind: "unavailable",
        reason: "служба снимков не слушает очередь",
      }),
      products: () => throwError(() => new Error("Timeout has occurred")),
    });
    const check = await service.check(TENANT, SITE);
    expect(check?.blocked).toBe(false);
    expect(check?.failed).toEqual([
      {
        place: "browser",
        check: "look",
        reason: "home: служба снимков не слушает очередь",
      },
      { place: "shop", check: "catalog", reason: "Timeout has occurred" },
    ]);

    const broken = setup({
      scope: async () => Promise.reject(new Error("db down")),
    });
    const scoped = await broken.service.check(TENANT, SITE);
    expect(broken.jobs).toEqual([]);
    expect(scoped?.failed).toEqual([
      {
        place: "browser",
        check: "look",
        reason: "что изменилось — не посчиталось: db down",
      },
    ]);
  });

  it("первая публикация — с пустой ревизии (весь магазин); больше 6 страниц — лишние «не проверены»", async () => {
    const pages = ["home", "catalog", "p1", "p2", "p3", "p4", "p5", "p6"].map(
      (page) => ({ page, whole: true }),
    );
    const { service, content, jobs } = setup({
      publishedRevisionId: null,
      scope: async () => ({ sections: [], pages, theme: false }),
    });
    const check = await service.check(TENANT, SITE);
    expect(content.checkScopeBetween).toHaveBeenCalledWith(
      SITE,
      null,
      "r2",
      expect.anything(),
    );
    expect(jobs.map((job) => job.page)).toEqual([
      "home",
      "catalog",
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
    expect(check?.failed).toEqual([
      {
        place: "browser",
        check: "look",
        reason: "не проверены страницы (больше 6 за раз): p5, p6",
      },
    ]);
  });

  it("общая секция на нескольких страницах — одна строка (шапка — один экземпляр), находки страницы — у каждой", async () => {
    const pages = ["home", "catalog", "product"].map((page) => ({
      page,
      whole: true,
    }));
    const finding = (
      section: string | null,
      rule: string,
      where: string,
      count: number,
    ) => ({
      place: "browser",
      check: "semantic",
      rule,
      level: "warning",
      section,
      where,
      text: `${rule} · почини`,
      count,
    });
    const { service } = setup({
      publishedRevisionId: null,
      scope: async () => ({ sections: [], pages, theme: false }),
      look: async (job) => ({
        kind: "snapshot",
        snapshot: {
          marks: { ok: true, results: [] },
          checks: {
            findings: [
              finding(
                "header-1",
                "region",
                "a «Магазин»",
                job.page === "home" ? 6 : 5,
              ),
              finding(null, "heading-level", job.page, 1),
            ],
            failed: [],
          },
        },
      }),
    });
    const check = await service.check(TENANT, SITE);
    const header = check?.findings.filter((one) => one.section === "header-1");
    expect(header).toEqual([
      expect.objectContaining({
        rule: "region",
        where: "a «Магазин»",
        count: 6,
      }),
    ]);
    expect(
      check?.findings
        .filter((one) => one.section === null)
        .map((one) => one.where),
    ).toEqual(["home", "catalog", "product"]);
  });

  it("магазин нынешней темы — проверки нет (null), снимков и товаров не спрашиваем", async () => {
    const { service, looks, products } = setup({ newTheme: false });
    expect(await service.check(TENANT, SITE)).toBeNull();
    expect(looks.look).not.toHaveBeenCalled();
    expect(products.send).not.toHaveBeenCalled();
  });
});

describe("sites.publish · проверка закрывает публикацию", () => {
  function controllerWith(options: Options = {}) {
    const parts = setup(options);
    const domain = {
      publish: jest.fn(async () => ({
        url: "https://shop.merfy.ru",
        buildId: "7",
        queued: true,
      })),
    };
    const controller = new SitesMicroserviceController(
      domain as any,
      parts.service,
    );
    return { ...parts, domain, controller };
  }

  it("ошибка — отказ publish_blocked с находками и списком словами, публикации нет, ревизия не запоминается", async () => {
    const { controller, domain, updates } = controllerWith({
      snapshot: brokenCart,
    });
    const reply: any = await controller.publish({
      tenantId: TENANT,
      siteId: SITE,
    });
    expect(reply).toMatchObject({ success: false, error: "publish_blocked" });
    expect(reply.message).toContain("Публикация остановлена: нужно починить 1");
    expect(reply.check.findings[0]).toMatchObject({
      check: "marks",
      level: "error",
    });
    expect(domain.publish).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("предупреждения — публикует, отдаёт их в check и запоминает проверенную ревизию", async () => {
    const { controller, domain, updates } = controllerWith();
    const reply: any = await controller.publish({
      tenantId: TENANT,
      siteId: SITE,
      mode: "production",
    });
    expect(domain.publish).toHaveBeenCalledWith({
      tenantId: TENANT,
      siteId: SITE,
      mode: "production",
    });
    expect(reply).toMatchObject({
      success: true,
      url: "https://shop.merfy.ru",
      buildId: "7",
    });
    expect(reply.check.findings).toHaveLength(1);
    expect(updates).toEqual([{ publishedRevisionId: "r2" }]);
  });

  it("skipChecks — «опубликовать как есть»: без снимков, публикует, запоминает текущую ревизию", async () => {
    const { controller, domain, looks, updates } = controllerWith({
      snapshot: brokenCart,
    });
    const reply: any = await controller.publish({
      tenantId: TENANT,
      siteId: SITE,
      skipChecks: true,
    });
    expect(looks.look).not.toHaveBeenCalled();
    expect(domain.publish).toHaveBeenCalled();
    expect(reply.success).toBe(true);
    expect(reply).not.toHaveProperty("check");
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toEqual({ publishedRevisionId: "r2" });
  });

  it("sites.publish.check — та же проверка без публикации", async () => {
    const { controller, domain } = controllerWith({ snapshot: brokenCart });
    const reply: any = await controller.publishCheckOnly({
      tenantId: TENANT,
      siteId: SITE,
    });
    expect(reply).toMatchObject({
      success: true,
      check: { blocked: true, pages: ["home"] },
    });
    expect(domain.publish).not.toHaveBeenCalled();
  });
});
