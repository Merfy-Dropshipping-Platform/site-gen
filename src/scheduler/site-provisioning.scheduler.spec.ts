import { SiteProvisioningScheduler } from './site-provisioning.scheduler';

describe('SiteProvisioningScheduler local startup guard', () => {
  const previous = process.env.SITE_PROVISIONING_CRON_ENABLED;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.SITE_PROVISIONING_CRON_ENABLED;
    } else {
      process.env.SITE_PROVISIONING_CRON_ENABLED = previous;
    }
  });

  it('skips orphan migration when provisioning is disabled', async () => {
    process.env.SITE_PROVISIONING_CRON_ENABLED = 'false';
    const sites = {
      migrateOrphanedSites: jest.fn().mockResolvedValue({
        migrated: 0,
        failed: 0,
        details: [],
      }),
    };
    const scheduler = new SiteProvisioningScheduler(
      {} as never,
      {} as never,
      sites as never,
    );

    await scheduler.onModuleInit();

    expect(sites.migrateOrphanedSites).not.toHaveBeenCalled();
  });

  it('skips the orphan reaper when provisioning is disabled', async () => {
    process.env.SITE_PROVISIONING_CRON_ENABLED = 'false';
    const sites = {
      migrateOrphanedSites: jest.fn().mockResolvedValue({
        migrated: 0,
        failed: 0,
        details: [],
      }),
    };
    const scheduler = new SiteProvisioningScheduler(
      {} as never,
      {} as never,
      sites as never,
    );

    await scheduler.onModuleInit();
    await scheduler.reapOrphanedSites();

    expect(sites.migrateOrphanedSites).not.toHaveBeenCalled();
  });
});
