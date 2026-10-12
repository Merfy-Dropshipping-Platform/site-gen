import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('API пакета (design.md блока 3, раздел 6)', () => {
  it('отдаёт ровно эти имена', () => {
    expect(Object.keys(api).sort()).toEqual([
      'CONFIG_TAG_ID',
      'COUNTER_KINDS',
      'COUNTER_NUMBERS',
      'StorefrontConfigError',
      'buildStorefrontConfig',
      'configTag',
      'escapeScriptJson',
      'isCounterNumber',
      'parseStorefrontConfig',
      'readStorefrontConfig',
      'rebuildEvents',
      'storefrontConfigSchema',
    ]);
  });
});
