import fs from 'node:fs';
import path from 'node:path';
import { ThemeManifestSchema } from '../validators/ThemeManifestSchema';
import { generateTokensCssV2 } from '../tokens/generateTokensCss.v2';
import { resolveBlocks } from '../resolver/resolveBlocks';
import { resolveConstructorConfig } from '../resolver/resolveConstructorConfig';
import { parseW3CTokens } from '../tokens/parseW3CTokens';

describe('Phase 0 End-to-End Smoke', () => {
  it('parses pilot-tokens.json, validates minimal manifest, resolves blocks, generates CSS', async () => {
    // 1. W3C tokens parse
    const tokensRaw = JSON.parse(fs.readFileSync(
      path.join(__dirname, '../tokens/pilot-tokens.json'),
      'utf-8',
    ));
    const parsed = parseW3CTokens(tokensRaw);
    expect(parsed['--color-primary'].value).toBe('#111111');

    // 2. Build a synthetic theme manifest
    const manifest = {
      id: 'smoke-theme',
      name: 'Smoke',
      version: '0.1.0',
      extends: '@merfy/theme-base@workspace:*',
      defaults: { '--radius-button': '4px' },
      colorSchemes: [{
        id: 'scheme-1',
        name: 'Light',
        tokens: { '--color-bg': '255 255 255', '--color-heading': '17 17 17' },
      }],
      blocks: {},
      features: { smoke: true },
      fonts: [{ family: 'Inter', weights: [400], source: 'google' }],
    };
    const parseResult = ThemeManifestSchema.safeParse(manifest);
    expect(parseResult.success).toBe(true);

    // 3. Generate CSS
    const css = generateTokensCssV2(manifest as any, { '--font-heading': 'sans' }, {});
    expect(css).toContain('--radius-button: 4px');
    expect(css).toContain('--font-heading: sans');
    expect(css).toContain('.color-scheme-1');
    expect(css).toContain('--feature-smoke: 1');

    // 4. Resolve blocks (no overrides, all base)
    const baseBlocks = { Hero: { source: 'base' as const, path: '@merfy/theme-base/blocks/Hero' } };
    const resolved = resolveBlocks(baseBlocks, { blocks: {}, features: {}, customBlocks: {} });
    expect(resolved.Hero.source).toBe('base');

    // 5. resolveConstructorConfig with a fake loader
    const config = await resolveConstructorConfig(resolved, async (_p: string) => ({
      HeroPuckConfig: {
        label: 'Hero',
        category: 'hero',
        fields: { title: { type: 'text' } },
        defaults: { title: 'Hi' },
        schema: {},
      },
    }));
    expect(config.components.Hero.label).toBe('Hero');
  });
});
