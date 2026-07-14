import { SitesDomainService } from "./sites.service";

/**
 * Юнит-тесты debounced-republish при сохранении branding в SitesDomainService.update.
 *
 * Паттерн повторяет sites.service.update-settings.spec.ts: ручной db-мок (9-арг
 * ctor), без реального Postgres. Для branding-only патча update() делает ровно
 * два db-обращения: snapshot-select и update().set().where().returning().
 * publish() спаим (реальная сборка не нужна), таймер debounce гоняем фейк-таймерами.
 */
function makeDb(existingRow: any) {
  const db: any = {
    select: () => ({
      from: (_t: any) => ({
        where: (_w: any) => ({
          limit: (_l: number) => Promise.resolve(existingRow ? [existingRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (_u: any) => ({
        where: (_w: any) => ({
          returning: (_r: any) => Promise.resolve([{ id: "s1" }]),
        }),
      }),
    }),
  };
  return { db };
}

function makeService(db: any) {
  const events = { emit: () => {} };
  return new SitesDomainService(
    db,
    {} as any, // coolifyClient
    {} as any, // generator
    events as any, // events
    {} as any, // deployments
    {} as any, // storage
    {} as any, // domainClient
    {} as any, // billingClient
    { queueBuild: () => Promise.resolve(true) } as any, // buildQueue
  );
}

const DEBOUNCE_MS = 8_000;

describe("SitesDomainService.update — branding republish (debounced)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("branding-патч на published → republish после debounce (mode production)", async () => {
    const { db } = makeDb({
      themeId: "rose",
      status: "published",
      settings: null,
      branding: { favicons: {} },
    });
    const service = makeService(db);
    const publishSpy = jest.spyOn(service as any, "publish").mockResolvedValue(true);

    await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { branding: { favicons: { universal: "https://s3/u.png" } } },
    });

    expect(publishSpy).not.toHaveBeenCalled(); // debounce ещё не сработал
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith({
      tenantId: "t1",
      siteId: "s1",
      mode: "production",
    });
  });

  it("branding-патч на draft → НЕ republish", async () => {
    const { db } = makeDb({ themeId: "rose", status: "draft", settings: null, branding: null });
    const service = makeService(db);
    const publishSpy = jest.spyOn(service as any, "publish").mockResolvedValue(true);

    await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { branding: { favicons: { universal: "https://s3/u.png" } } },
    });

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("branding идентичен текущему → НЕ republish (change-detection)", async () => {
    const same = { favicons: { universal: "https://s3/u.png" } };
    const { db } = makeDb({ themeId: "rose", status: "published", settings: null, branding: same });
    const service = makeService(db);
    const publishSpy = jest.spyOn(service as any, "publish").mockResolvedValue(true);

    await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { branding: { favicons: { universal: "https://s3/u.png" } } },
    });

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("патч без ключа branding (name) → НЕ republish", async () => {
    const { db } = makeDb({ themeId: "rose", status: "published", settings: null, branding: null });
    const service = makeService(db);
    const publishSpy = jest.spyOn(service as any, "publish").mockResolvedValue(true);

    await service.update({ tenantId: "t1", siteId: "s1", patch: { name: "New name" } });

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("серия из 4 branding-сохранений в окне debounce → ровно 1 republish", async () => {
    let current: any = {};
    const db: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                { themeId: "rose", status: "published", settings: null, branding: { ...current } },
              ]),
          }),
        }),
      }),
      update: () => ({
        set: (u: any) => {
          current = u.branding;
          return { where: () => ({ returning: () => Promise.resolve([{ id: "s1" }]) }) };
        },
      }),
    };
    const service = makeService(db);
    const publishSpy = jest.spyOn(service as any, "publish").mockResolvedValue(true);

    for (const v of ["universal", "dark", "light", "apple"]) {
      await service.update({
        tenantId: "t1",
        siteId: "s1",
        patch: {
          branding: { ...current, favicons: { ...(current.favicons ?? {}), [v]: `https://s3/${v}.png` } },
        },
      });
      jest.advanceTimersByTime(1_000); // < окна: таймер сбрасывается каждым сохранением
    }
    expect(publishSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).toHaveBeenCalledTimes(1);
  });

  it("совместная смена темы + branding на published → ровно 1 publish (без дубля)", async () => {
    const { db } = makeDb({ themeId: "rose", status: "published", settings: null, branding: null });
    const service = makeService(db);
    const publishSpy = jest.spyOn(service as any, "publish").mockResolvedValue(true);
    // reseed-путь смены темы читает/пишет ревизию — гасим, чтобы тест был детерминирован
    jest.spyOn(service as any, "buildInitialRevision").mockResolvedValue(null);

    await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { themeId: "bloom", branding: { favicons: { universal: "https://s3/u.png" } } },
    });

    // theme-switch republish — синхронный (void this.publish); branding-ветка пропущена дедупом
    expect(publishSpy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).toHaveBeenCalledTimes(1);
  });

  it("branding с переставленными ключами (jsonb key-order) → НЕ republish", async () => {
    const existing = {
      primaryColor: "#111",
      favicons: { universal: "https://s3/u.png", dark: "https://s3/d.png" },
      logoUrl: "https://s3/l.png",
    };
    // те же данные, другой порядок ключей (верхний уровень и вложенный favicons)
    const patch = {
      logoUrl: "https://s3/l.png",
      favicons: { dark: "https://s3/d.png", universal: "https://s3/u.png" },
      primaryColor: "#111",
    };
    const { db } = makeDb({ themeId: "rose", status: "published", settings: null, branding: existing });
    const service = makeService(db);
    const publishSpy = jest.spyOn(service as any, "publish").mockResolvedValue(true);

    await service.update({ tenantId: "t1", siteId: "s1", patch: { branding: patch } });

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("debounce изолирован по siteId — правки двух сайтов дают по одному publish", async () => {
    const { db } = makeDb({ themeId: "rose", status: "published", settings: null, branding: null });
    const service = makeService(db);
    const publishSpy = jest.spyOn(service as any, "publish").mockResolvedValue(true);

    await service.update({ tenantId: "t1", siteId: "s1", patch: { branding: { favicons: { universal: "https://s3/a.png" } } } });
    await service.update({ tenantId: "t1", siteId: "s2", patch: { branding: { favicons: { universal: "https://s3/b.png" } } } });

    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).toHaveBeenCalledTimes(2);
    expect(publishSpy).toHaveBeenCalledWith({ tenantId: "t1", siteId: "s1", mode: "production" });
    expect(publishSpy).toHaveBeenCalledWith({ tenantId: "t1", siteId: "s2", mode: "production" });
  });

  it("сохранение во время идущей публикации → одна догоняющая пересборка после её завершения (без гонки)", async () => {
    const { db } = makeDb({ themeId: "rose", status: "published", settings: null, branding: null });
    const service = makeService(db);
    let resolve1!: () => void;
    const publishSpy = jest
      .spyOn(service as any, "publish")
      .mockImplementationOnce(() => new Promise<void>((r) => { resolve1 = () => r(); })) // #1 «висит»
      .mockResolvedValue(undefined); // последующие мгновенно

    // save A → debounce → publish #1 стартует и «висит» (in-flight)
    await service.update({ tenantId: "t1", siteId: "s1", patch: { branding: { favicons: { universal: "https://s3/a.png" } } } });
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).toHaveBeenCalledTimes(1);

    // save B пока #1 in-flight → debounce → видит in-flight → pending, БЕЗ второго publish
    await service.update({ tenantId: "t1", siteId: "s1", patch: { branding: { favicons: { universal: "https://s3/b.png" } } } });
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).toHaveBeenCalledTimes(1);

    // #1 завершилась → pending → перепланирован debounce → publish #2
    resolve1();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(DEBOUNCE_MS);
    expect(publishSpy).toHaveBeenCalledTimes(2);
  });
});
