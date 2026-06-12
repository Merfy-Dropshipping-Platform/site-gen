/**
 * Unit tests for sites.dev_list_all RMQ handler.
 *
 * Tests:
 * - success: service returns site list → handler returns { success: true, sites }
 * - failure: service throws → handler returns { success: false, message }
 */

import { SitesMicroserviceController } from '../sites.microservice.controller';

const MOCK_SITES = [
  { id: 's1', name: 'Alpha Shop', themeId: 'rose', tenantId: 't1', storageSlug: 'abc123' },
  { id: 's2', name: 'Beta Shop', themeId: null, tenantId: 't2', storageSlug: null },
];

function makeController(serviceOverrides?: Partial<Record<string, any>>) {
  const fakeService: any = {
    listAllForDev: jest.fn().mockResolvedValue(MOCK_SITES),
    ...serviceOverrides,
  };
  const fakeLogger: any = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const controller = new SitesMicroserviceController(fakeService);
  // Override the private logger so we can assert on error calls
  (controller as any).logger = fakeLogger;
  return { controller, fakeService, fakeLogger };
}

describe('SitesMicroserviceController.devListAll', () => {
  it('returns { success: true, sites } when service resolves', async () => {
    const { controller } = makeController();
    const result = await controller.devListAll();
    expect(result).toEqual({ success: true, sites: MOCK_SITES });
  });

  it('passes all five fields from service response', async () => {
    const { controller } = makeController();
    const result = await controller.devListAll() as any;
    expect(result.success).toBe(true);
    expect(result.sites).toHaveLength(2);
    expect(result.sites[0]).toMatchObject({
      id: 's1',
      name: 'Alpha Shop',
      themeId: 'rose',
      tenantId: 't1',
      storageSlug: 'abc123',
    });
    expect(result.sites[1].themeId).toBeNull();
    expect(result.sites[1].storageSlug).toBeNull();
  });

  it('returns { success: false, message } when service throws', async () => {
    const { controller, fakeLogger } = makeController({
      listAllForDev: jest.fn().mockRejectedValue(new Error('db_error')),
    });
    const result = await controller.devListAll() as any;
    expect(result).toEqual({ success: false, message: 'db_error' });
    expect(fakeLogger.error).toHaveBeenCalledWith('dev_list_all failed', expect.any(Error));
  });

  it('returns internal_error message when thrown error has no message', async () => {
    const { controller } = makeController({
      listAllForDev: jest.fn().mockRejectedValue(null),
    });
    const result = await controller.devListAll() as any;
    expect(result).toEqual({ success: false, message: 'internal_error' });
  });
});
