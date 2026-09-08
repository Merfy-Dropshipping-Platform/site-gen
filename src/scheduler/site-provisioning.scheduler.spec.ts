import { SiteProvisioningScheduler } from "./site-provisioning.scheduler";

describe("SiteProvisioningScheduler", () => {
  const originalStartupMigration =
    process.env.SITE_ORPHAN_MIGRATION_ON_STARTUP_ENABLED;

  afterEach(() => {
    if (originalStartupMigration === undefined) {
      delete process.env.SITE_ORPHAN_MIGRATION_ON_STARTUP_ENABLED;
    } else {
      process.env.SITE_ORPHAN_MIGRATION_ON_STARTUP_ENABLED =
        originalStartupMigration;
    }
  });

  it("skips orphan migration on startup when explicitly disabled", async () => {
    process.env.SITE_ORPHAN_MIGRATION_ON_STARTUP_ENABLED = "false";
    const sites = {
      migrateOrphanedSites: jest.fn(),
    };
    const scheduler = new SiteProvisioningScheduler(
      {} as never,
      {} as never,
      sites as never,
    );

    await scheduler.onModuleInit();

    expect(sites.migrateOrphanedSites).not.toHaveBeenCalled();
  });
});
