import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Block, Registry } from './types.js';

/**
 * Scan packages/theme-base/blocks/* + sibling theme-X/blocks/* для overrides.
 *
 * Метаданные (label, category, paletteOrder, hidden) извлекаются из
 * <Block>.puckConfig.ts через regex над source текстом — намеренно избегаем
 * dynamic import .ts (Node не can import TS at runtime без tsx/ts-node).
 * Если в будущем понадобятся `schemaJson` / `defaults` (объекты) — можно
 * добавить AST-парсинг через @typescript/parser. Пока set to `{}`.
 */
export async function scanBlockRegistry(packagesDir: string): Promise<Registry> {
  const blocks: Block[] = [];
  const themes = await fs.readdir(packagesDir, { withFileTypes: true });
  const baseDir = themes.find((d) => d.isDirectory() && d.name === 'theme-base');
  if (!baseDir) {
    throw new Error(`theme-base not found in ${packagesDir}`);
  }

  const baseBlocksDir = path.join(packagesDir, 'theme-base', 'blocks');
  const baseEntries = await fs.readdir(baseBlocksDir, { withFileTypes: true });

  for (const entry of baseEntries) {
    if (!entry.isDirectory()) continue;
    const blockDir = path.join(baseBlocksDir, entry.name);
    const files = await fs.readdir(blockDir);
    const hasAstro = files.includes(`${entry.name}.astro`);
    const puckConfigFile = files.find((f) => f === `${entry.name}.puckConfig.ts`);

    let label = entry.name;
    let category: Block['category'] = 'content';
    let hidden = false;
    let paletteOrder = 100;

    if (puckConfigFile) {
      const cfgText = await fs.readFile(path.join(blockDir, puckConfigFile), 'utf-8');
      label = extractStringField(cfgText, 'label') ?? entry.name;
      const cat = extractStringField(cfgText, 'category');
      if (cat && isValidCategory(cat)) category = cat;
      hidden = extractBooleanField(cfgText, 'hidden') ?? false;
      paletteOrder = extractNumberField(cfgText, 'paletteOrder') ?? 100;
    }

    const hasOverride: string[] = [];
    for (const t of themes) {
      if (!t.isDirectory() || !t.name.startsWith('theme-') || t.name === 'theme-base') continue;
      const overrideDir = path.join(packagesDir, t.name, 'blocks', entry.name);
      try {
        await fs.access(overrideDir);
        hasOverride.push(t.name.replace(/^theme-/, ''));
      } catch {
        // override absent for this theme — skip
      }
    }

    const siblings = files.filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
    );

    blocks.push({
      name: entry.name,
      label,
      category,
      hidden,
      paletteOrder,
      hasAstroRenderer: hasAstro,
      hasOverride,
      siblings,
      schemaJson: {},
      defaults: {},
    });
  }

  return {
    blocks,
    scannedAt: new Date().toISOString(),
    source: path.relative(process.cwd(), packagesDir),
  };
}

function isValidCategory(s: string): s is Block['category'] {
  return ['media', 'content', 'commerce', 'chrome', 'account', 'checkout'].includes(s);
}

function extractStringField(text: string, field: string): string | undefined {
  const re = new RegExp(`\\b${field}:\\s*['"]([^'"]+)['"]`);
  return re.exec(text)?.[1];
}

function extractBooleanField(text: string, field: string): boolean | undefined {
  const re = new RegExp(`\\b${field}:\\s*(true|false)\\b`);
  const m = re.exec(text);
  return m ? m[1] === 'true' : undefined;
}

function extractNumberField(text: string, field: string): number | undefined {
  const re = new RegExp(`\\b${field}:\\s*(-?\\d+)\\b`);
  const m = re.exec(text);
  return m ? Number(m[1]) : undefined;
}
