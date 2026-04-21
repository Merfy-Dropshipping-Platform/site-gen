import fs from 'node:fs/promises';
import path from 'node:path';
import { ThemeManifestSchema } from './ThemeManifestSchema';
import { validateBlock } from './validateBlock';
import { validateTokens } from './validateTokens';

export interface ValidateThemeResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateThemeV2(themeDir: string): Promise<ValidateThemeResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Read + parse theme.json
  const manifestPath = path.join(themeDir, 'theme.json');
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
  } catch (e) {
    return { ok: false, errors: [`theme.json not found or invalid JSON: ${(e as Error).message}`], warnings };
  }

  const zodResult = ThemeManifestSchema.safeParse(manifestRaw);
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      errors.push(`[manifest] ${issue.path.join('.')}: ${issue.message}`);
    }
    return { ok: false, errors, warnings };
  }

  const manifest = zodResult.data;

  // 2. Validate tokens in defaults + colorSchemes
  const tokenCheck = validateTokens(manifest.defaults);
  errors.push(...tokenCheck.errors.map(e => `[tokens.defaults] ${e}`));
  for (const scheme of manifest.colorSchemes) {
    const r = validateTokens(scheme.tokens);
    errors.push(...r.errors.map(e => `[tokens.${scheme.id}] ${e}`));
  }

  // 3. Validate each block override
  for (const [blockName, cfg] of Object.entries(manifest.blocks)) {
    if ('override' in cfg && cfg.override) {
      const blockPath = path.resolve(themeDir, cfg.override.path);
      const r = await validateBlock(blockPath);
      errors.push(...r.errors.map(e => `[block.${blockName}] ${e}`));
      warnings.push(...r.warnings.map(w => `[block.${blockName}] ${w}`));
    }
  }

  // 4. Validate custom blocks
  for (const [name, cfg] of Object.entries(manifest.customBlocks ?? {})) {
    const blockPath = path.resolve(themeDir, cfg.path);
    const r = await validateBlock(blockPath);
    errors.push(...r.errors.map(e => `[customBlock.${name}] ${e}`));
  }

  return { ok: errors.length === 0, errors, warnings };
}
