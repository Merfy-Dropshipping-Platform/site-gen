import fs from 'node:fs/promises';
import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';

const BLOCKS_DIR = path.resolve(__dirname, '../blocks');

describe('All theme-base blocks', () => {
  it('every block in blocks/ passes validateBlock', async () => {
    const entries = await fs.readdir(BLOCKS_DIR, { withFileTypes: true });
    const blockDirs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name);

    expect(blockDirs.length).toBeGreaterThanOrEqual(18);

    const failures: Array<{ block: string; errors: string[] }> = [];
    for (const block of blockDirs) {
      const result = await validateBlock(path.join(BLOCKS_DIR, block));
      if (!result.ok) {
        failures.push({ block, errors: result.errors });
      }
    }

    if (failures.length > 0) {
      console.error('Block validation failures:', JSON.stringify(failures, null, 2));
    }
    expect(failures).toEqual([]);
  });
});
