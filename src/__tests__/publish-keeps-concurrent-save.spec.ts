/**
 * Публикация не откатывает правки, сделанные во время сборки (ревью этапа 2).
 *
 * Было: синхронная публикация в конце ставила указатель текущей ревизии на
 * ту, что сборка прочитала в начале. Автосейв, пришедший во время сборки,
 * молча переставал быть текущим. Раньше это маскировал 409: вкладка всё
 * равно замерзала. Со слиянием (этап 2) вкладка продолжает сохранять — и
 * потеря стала бы тихой. Стало: публикация указатель не трогает (сборка и
 * так собирала текущую); двигает его только порт StoreContent.
 */
import { SitesDomainService } from "../sites.service";
import { makeFakeRevisionDb } from "../content/__tests__/fake-revision-db";

const SITE = "site-1";
const TENANT = "tenant-1";

function makeService(fake: ReturnType<typeof makeFakeRevisionDb>) {
  const generator = {
    build: jest.fn(async () => {
      // Сборка прочитала r0, а пока она шла, пришёл автосейв конструктора.
      fake.seedRevision("r-autosave", { pages: [], pagesData: {} });
      return {
        buildId: "b1",
        artifactUrl: "file:///tmp/a.zip",
        revisionId: "r0",
      };
    }),
  };
  const events = { emit: jest.fn() };
  const deployments = { deploy: jest.fn(async () => ({ deploymentId: "d1" })) };
  const storage = { extractSubdomainSlug: () => "shop" };
  const dep = {} as any;
  const service = new SitesDomainService(
    fake.db,
    dep,
    generator as any,
    events as any,
    deployments as any,
    storage as any,
    dep,
    dep,
    dep,
  );
  jest.spyOn(service, "get").mockImplementation(
    async () =>
      ({
        ...fake.site,
        publicUrl: "https://shop.merfy.ru",
        storageSlug: "shop",
        coolifyAppUuid: "app-1",
      }) as never,
  );
  return { service, generator, events };
}

describe("publish() и автосейв во время сборки", () => {
  it("правка, записанная во время синхронной сборки, остаётся текущей", async () => {
    const fake = makeFakeRevisionDb({ id: SITE, tenantId: TENANT });
    fake.seedRevision("r0", { pages: [], pagesData: {} });
    const { service, generator, events } = makeService(fake);

    const res = await service.publish({
      tenantId: TENANT,
      siteId: SITE,
      mode: "production",
    });

    expect(generator.build).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ buildId: "b1", url: "https://shop.merfy.ru" });
    expect(fake.site.currentRevisionId).toBe("r-autosave");
    expect((fake.site as any).status).toBe("published");
    expect(events.emit).toHaveBeenCalledWith(
      "sites.site.published",
      expect.objectContaining({ siteId: SITE, buildId: "b1" }),
    );
  });
});
