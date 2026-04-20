import path from 'node:path';
import { validateThemeV2 } from '../validators/validateTheme.v2';

const fixtures = path.resolve(__dirname, 'fixtures/themes');

describe('validateThemeV2', () => {
  it('passes for valid minimal theme', async () => {
    const r = await validateThemeV2(path.join(fixtures, 'minimal-theme'));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('fails when theme.json is missing', async () => {
    const r = await validateThemeV2(path.join(fixtures, 'nonexistent-theme-xxx'));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/theme\.json/);
  });
});
