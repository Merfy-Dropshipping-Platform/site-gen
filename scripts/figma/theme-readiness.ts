#!/usr/bin/env tsx
/**
 * figma:theme-readiness — per-theme view of library readiness.
 * For each of 5 themes, answer: "can we build this theme's Figma design
 * using @merfy/theme-base blocks today?"
 *
 * Reads: figma-inventory.json + per-theme tokens.json + audit feature extraction.
 * Produces: docs/078-theme-system/theme-readiness.md
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readBlockConfig } from './lib/block-config-reader.js';
import { DEFAULT_FILE_KEY, loadEnv, requireEnv } from './lib/env.js';
import { extractFeatures, type BlockFeatures } from './lib/figma-features.js';
import { FigmaRestClient } from './lib/rest-client.js';
import type {
  BlockName,
  FigmaInventory,
  ThemeId,
  Viewport,
} from './lib/types.js';
import { BLOCK_WHITELIST, THEME_IDS } from './lib/types.js';

loadEnv();

const INVENTORY_PATH = resolve(process.cwd(), 'docs/078-theme-system/figma-inventory.json');
const OUT_PATH = resolve(process.cwd(), 'docs/078-theme-system/theme-readiness.md');
const PACKAGES_ROOT = resolve(process.cwd(), 'packages');

const RUNTIME_BLOCKS: BlockName[] = [
  'AuthModal',
  'CartDrawer',
  'CheckoutSection',
  'AccountLayout',
  'CartSection',
  'CheckoutHeader',
  'CheckoutLayout',
];

interface ThemeTokens {
  container?: string;
  radiusButton?: string;
  radiusCard?: string;
  radiusMedia?: string;
  radiusInput?: string;
  fontHeading?: string;
  fontBody?: string;
  colorPrimary?: string;
  colorBg?: string;
  colorAccent?: string;
}

function readThemeTokens(themeId: ThemeId): ThemeTokens | null {
  const path = resolve(PACKAGES_ROOT, `theme-${themeId}/tokens.json`);
  if (!existsSync(path)) return null;
  try {
    const t = JSON.parse(readFileSync(path, 'utf8'));
    const v = (obj: any, ...keys: string[]) =>
      keys.reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj)?.$value;
    return {
      container: v(t, 'size', 'container-max'),
      radiusButton: v(t, 'radius', 'button'),
      radiusCard: v(t, 'radius', 'card'),
      radiusMedia: v(t, 'radius', 'media'),
      radiusInput: v(t, 'radius', 'input'),
      fontHeading: v(t, 'font', 'heading'),
      fontBody: v(t, 'font', 'body'),
      colorPrimary: v(t, 'color', 'primary'),
      colorBg: v(t, 'color', 'bg'),
      colorAccent: v(t, 'color', 'accent'),
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n📊 figma:theme-readiness\n`);

  const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as FigmaInventory;
  const apiKey = requireEnv('FIGMA_API_KEY');
  const client = new FigmaRestClient({ apiKey, fileKey: inventory.fileKey });

  const configs = Object.fromEntries(BLOCK_WHITELIST.map((b) => [b, readBlockConfig(b)])) as Record<
    BlockName,
    ReturnType<typeof readBlockConfig>
  >;

  // Extract features for all theme × block @ 1920 (most important viewport)
  interface Target {
    themeId: ThemeId;
    block: BlockName;
    nodeId: string;
  }
  const targets: Target[] = [];
  for (const themeId of THEME_IDS) {
    const t = inventory.themes[themeId];
    for (const [blockName, vps] of Object.entries(t.blocks)) {
      const entry1920 = vps?.['1920' as Viewport];
      if (entry1920) {
        targets.push({ themeId, block: blockName as BlockName, nodeId: entry1920.nodeId });
      }
    }
  }
  console.log(`→ Fetching ${targets.length} nodes (1920 viewport per theme/block)...`);

  const featuresByKey = new Map<string, BlockFeatures>();
  const BATCH = 10;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const ids = batch.map((t) => t.nodeId);
    try {
      const res = await client.getNodes(ids, { depth: 4 });
      for (const t of batch) {
        const node = res.nodes[t.nodeId]?.document;
        if (!node) continue;
        featuresByKey.set(`${t.themeId}:${t.block}`, extractFeatures(node));
      }
      process.stdout.write(`   ${Math.min(i + BATCH, targets.length)}/${targets.length}\r`);
    } catch {}
  }
  console.log(`\n   ${featuresByKey.size} features extracted\n`);

  // Build per-theme readiness
  type Readiness = 'full' | 'partial' | 'gap' | 'runtime' | 'missing';
  interface BlockReadiness {
    block: BlockName;
    readiness: Readiness;
    note: string;
    hints: string[];
  }
  interface ThemeReadiness {
    themeId: ThemeId;
    viewports: Viewport[];
    tokens: ThemeTokens | null;
    blocksInFigma: BlockName[];
    blocksMissing: BlockName[];
    perBlock: BlockReadiness[];
    summary: {
      totalBlocks: number;
      full: number;
      partial: number;
      gap: number;
      runtime: number;
    };
    score: number; // 0-100
  }

  const reports: ThemeReadiness[] = [];

  for (const themeId of THEME_IDS) {
    const themeInv = inventory.themes[themeId];
    const tokens = readThemeTokens(themeId);
    const blocksInFigma = Object.keys(themeInv.blocks) as BlockName[];
    const perBlock: BlockReadiness[] = [];

    for (const block of blocksInFigma) {
      const cfg = configs[block];
      const feat = featuresByKey.get(`${themeId}:${block}`);
      const hints = feat?.variantHints ?? [];
      if (RUNTIME_BLOCKS.includes(block)) {
        perBlock.push({
          block,
          readiness: 'runtime',
          note: 'Runtime-interactive React island — Figma mock is reference only',
          hints,
        });
        continue;
      }
      const unexpressible: string[] = [];
      for (const h of hints) {
        // Plain text containers — hints about images/grids/buttons are Figma adjacency artifacts
        if (cfg.isPlainTextContainer && (h.includes('multi-image') || /^grid-\d+col/.test(h) || h.includes('pill') || h.includes('flat'))) continue;

        if (h.includes('multi-image') && !cfg.hasMultiImageCapability && !cfg.hasInternalMultiImage) unexpressible.push(h);
        else if (
          /^grid-\d+col/.test(h) &&
          !cfg.hasColumnsProp &&
          cfg.hasArrayProps.length === 0 &&
          !cfg.hasInternalCompositeLayout
        )
          unexpressible.push(h);
        else if (h.includes('has-form') && !cfg.hasFormCapability) unexpressible.push(h);
        else if ((h.includes('pill') || h.includes('flat')) && !cfg.tokensUsed.some((t) => t.startsWith('--radius-')))
          unexpressible.push(h);
      }
      if (unexpressible.length === 0) {
        perBlock.push({ block, readiness: 'full', note: 'Library expresses all observed features', hints });
      } else {
        const partial = hints.length > unexpressible.length;
        perBlock.push({
          block,
          readiness: partial ? 'partial' : 'gap',
          note: `Missing: ${unexpressible.join(', ')}`,
          hints,
        });
      }
    }

    const missing = BLOCK_WHITELIST.filter(
      (b) => !blocksInFigma.includes(b) && !RUNTIME_BLOCKS.includes(b),
    );

    const summary = {
      totalBlocks: perBlock.length,
      full: perBlock.filter((r) => r.readiness === 'full').length,
      partial: perBlock.filter((r) => r.readiness === 'partial').length,
      gap: perBlock.filter((r) => r.readiness === 'gap').length,
      runtime: perBlock.filter((r) => r.readiness === 'runtime').length,
    };
    const contentBlocks = summary.full + summary.partial + summary.gap;
    const score = contentBlocks > 0
      ? Math.round(((summary.full + summary.partial * 0.5) / contentBlocks) * 100)
      : 0;

    reports.push({
      themeId,
      viewports: themeInv.viewports,
      tokens,
      blocksInFigma,
      blocksMissing: missing,
      perBlock,
      summary,
      score,
    });
  }

  // Render markdown
  const out: string[] = [];
  out.push(`# Theme Readiness Report`);
  out.push('');
  out.push(`**Figma file:** \`${inventory.fileKey}\` (${inventory.fileName})`);
  out.push(`**Generated:** ${new Date().toISOString()}`);
  out.push('');
  out.push(
    `Per-theme assessment: can we construct this theme's Figma design today using \`@merfy/theme-base/blocks/\` + tokens from \`packages/theme-<name>/tokens.json\`?`,
  );
  out.push('');
  out.push(`**Readiness:**`);
  out.push(`- 🟢 **full** — library expresses all observed Figma features for this block`);
  out.push(`- 🟡 **partial** — some features supported, some require Phase 2d extension`);
  out.push(`- 🔴 **gap** — block cannot express required Figma layout/shape yet`);
  out.push(`- 🔵 **runtime** — React island (AuthModal / CartDrawer / CheckoutSection); Figma is reference, not editable via Puck`);
  out.push('');

  // Summary table
  out.push(`## Summary — theme readiness scores`);
  out.push('');
  out.push('| Theme | Score | Viewports | Full | Partial | Gap | Runtime | Missing in Figma |');
  out.push('|-------|:-----:|-----------|:----:|:-------:|:---:|:-------:|:----------------:|');
  for (const r of reports) {
    const bar = '█'.repeat(Math.floor(r.score / 10)) + '░'.repeat(10 - Math.floor(r.score / 10));
    out.push(
      `| **${r.themeId}** | \`${bar}\` ${r.score}% | ${r.viewports.join(', ')} | 🟢 ${r.summary.full} | 🟡 ${r.summary.partial} | 🔴 ${r.summary.gap} | 🔵 ${r.summary.runtime} | ${r.blocksMissing.length} |`,
    );
  }
  out.push('');

  // Per-theme detail
  for (const r of reports) {
    out.push(`---`);
    out.push('');
    out.push(`## ${r.themeId.toUpperCase()} — readiness ${r.score}%`);
    out.push('');
    if (r.tokens) {
      out.push(`**Theme tokens:**`);
      out.push('');
      const kv = (label: string, val?: string) => (val ? `- ${label}: \`${val}\`` : null);
      [
        kv('container max-width', r.tokens.container),
        kv('font heading', r.tokens.fontHeading),
        kv('font body', r.tokens.fontBody),
        kv('radius.button', r.tokens.radiusButton),
        kv('radius.card', r.tokens.radiusCard),
        kv('radius.media', r.tokens.radiusMedia),
        kv('radius.input', r.tokens.radiusInput),
        kv('color.primary', r.tokens.colorPrimary),
        kv('color.bg', r.tokens.colorBg),
        kv('color.accent', r.tokens.colorAccent),
      ].filter(Boolean).forEach((l) => out.push(l!));
      out.push('');
    } else {
      out.push(`**Theme tokens:** _package \`theme-${r.themeId}\` not found_`);
      out.push('');
    }

    out.push(`**Viewports in Figma:** ${r.viewports.join(', ')}`);
    out.push('');
    out.push(`**Figma → block mapping:** ${r.blocksInFigma.length} blocks`);
    out.push('');
    out.push('| Block | Status | Note | Figma hints |');
    out.push('|-------|--------|------|-------------|');
    const statusIcon: Record<Readiness, string> = {
      full: '🟢 full',
      partial: '🟡 partial',
      gap: '🔴 gap',
      runtime: '🔵 runtime',
      missing: '⊘ missing',
    };
    for (const b of r.perBlock) {
      out.push(
        `| \`${b.block}\` | ${statusIcon[b.readiness]} | ${b.note} | ${b.hints.join('; ') || '—'} |`,
      );
    }
    out.push('');

    if (r.blocksMissing.length > 0) {
      out.push(
        `**Missing from Figma** (not yet designed, but present in library): ${r.blocksMissing.map((b) => `\`${b}\``).join(', ')}`,
      );
      out.push('');
    }
  }

  out.push(`---`);
  out.push('');
  out.push(`## What this means for Phase 2e (preset building)`);
  out.push('');
  out.push(`Themes with higher scores are ready for preset construction through the constructor. Lower-score themes will surface real gaps during preset building; those become Phase 2d follow-ups.`);
  out.push('');

  writeFileSync(OUT_PATH, out.join('\n') + '\n');
  console.log(`\n💾 wrote ${OUT_PATH}`);

  console.log(`\n📊 Readiness scores:`);
  for (const r of reports) {
    console.log(`   ${r.themeId.padEnd(8)} ${r.score}%`);
  }
}

main().catch((err) => {
  console.error(`\n❌ theme-readiness failed:`, err);
  process.exit(1);
});
