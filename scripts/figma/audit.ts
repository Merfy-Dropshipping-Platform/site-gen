#!/usr/bin/env tsx
/**
 * figma:audit — for each theme × block × viewport, fetch Figma node,
 * extract surface features, compare against @merfy/theme-base/blocks/<B>.puckConfig.ts,
 * emit markdown coverage report + gap summary.
 *
 * Inputs:  docs/078-theme-system/figma-inventory.json
 *          packages/theme-base/blocks/<B>/<B>.puckConfig.ts
 * Outputs: docs/078-theme-system/block-coverage-report.md
 *          docs/078-theme-system/block-gap-summary.md
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { readBlockConfig } from './lib/block-config-reader.js';
import { DEFAULT_FILE_KEY, loadEnv, requireEnv } from './lib/env.js';
import { extractFeatures, BlockFeatures } from './lib/figma-features.js';
import { FigmaRestClient } from './lib/rest-client.js';
import type {
  BlockName,
  FigmaInventory,
  ThemeId,
  Viewport,
} from './lib/types.js';
import { BLOCK_WHITELIST, THEME_IDS } from './lib/types.js';

loadEnv();

const INVENTORY_PATH = resolve(
  process.cwd(),
  'docs/078-theme-system/figma-inventory.json',
);
const REPORT_PATH = resolve(
  process.cwd(),
  'docs/078-theme-system/block-coverage-report.md',
);
const GAP_PATH = resolve(
  process.cwd(),
  'docs/078-theme-system/block-gap-summary.md',
);

/**
 * Backend/chrome blocks — rarely rendered in Figma, normally not expected there.
 * Missing in Figma = OK (not a gap).
 */
const BACKEND_ONLY_BLOCKS: BlockName[] = [
  'AccountLayout',
  'CartSection',
  'CheckoutHeader',
  'CheckoutLayout',
];

async function main() {
  console.log(`\n🔍 figma:audit`);

  const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as FigmaInventory;
  console.log(`   file: ${inventory.fileKey} (${inventory.fileName})`);

  const apiKey = requireEnv('FIGMA_API_KEY');
  const client = new FigmaRestClient({ apiKey, fileKey: inventory.fileKey });

  // Read all block configs once
  console.log(`\n→ Reading ${BLOCK_WHITELIST.length} block configs from packages/theme-base/...`);
  const configs = Object.fromEntries(BLOCK_WHITELIST.map((b) => [b, readBlockConfig(b)])) as Record<
    BlockName,
    ReturnType<typeof readBlockConfig>
  >;
  const withConfig = BLOCK_WHITELIST.filter((b) => configs[b].hasFile);
  console.log(`   ${withConfig.length}/${BLOCK_WHITELIST.length} blocks have puckConfig.ts`);

  // Collect every (theme, block, viewport, nodeId) tuple
  interface Target {
    themeId: ThemeId;
    block: BlockName;
    viewport: Viewport;
    nodeId: string;
    figmaLabel: string;
  }
  const targets: Target[] = [];
  for (const themeId of THEME_IDS) {
    const theme = inventory.themes[themeId];
    for (const [blockName, vps] of Object.entries(theme.blocks)) {
      if (!vps) continue;
      for (const [vp, entry] of Object.entries(vps)) {
        if (!entry) continue;
        targets.push({
          themeId,
          block: blockName as BlockName,
          viewport: vp as Viewport,
          nodeId: entry.nodeId,
          figmaLabel: entry.name,
        });
      }
    }
  }

  console.log(`\n→ Fetching ${targets.length} Figma nodes (depth=4)...`);

  // Batch: Figma /nodes endpoint supports multiple ids in one call.
  // We'll batch by 10 to keep responses manageable.
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
        const feat = extractFeatures(node);
        featuresByKey.set(`${t.themeId}:${t.block}:${t.viewport}`, feat);
      }
      process.stdout.write(`   ${Math.min(i + BATCH, targets.length)}/${targets.length}\r`);
    } catch (err) {
      console.error(`\n   ⚠ batch failed: ${(err as Error).message}`);
    }
  }
  console.log(`\n   ${featuresByKey.size} features extracted`);

  // Build coverage report per-theme
  const reportLines: string[] = [];
  reportLines.push(`# Block Coverage Report — Phase 2c Audit`);
  reportLines.push('');
  reportLines.push(`**Figma file:** \`${inventory.fileKey}\` (${inventory.fileName})`);
  reportLines.push(`**Generated:** ${new Date().toISOString()}`);
  reportLines.push('');
  reportLines.push(
    `**Legend:** ✓ — block exists in Figma | ⊘ — missing, backend-only (OK) | ❓ — missing, design-pending`,
  );
  reportLines.push('');

  // Per-theme sections
  for (const themeId of THEME_IDS) {
    const theme = inventory.themes[themeId];
    reportLines.push(`## Theme: ${themeId}`);
    reportLines.push('');
    reportLines.push(`Figma viewports: **${theme.viewports.join(', ') || '—'}**`);
    reportLines.push('');

    // Block coverage table
    reportLines.push('| Block | 1920 | 1280 | 375 | Code variants | Observations |');
    reportLines.push('|-------|:----:|:----:|:---:|---------------|--------------|');
    for (const block of BLOCK_WHITELIST) {
      const vps = theme.blocks[block];
      const cell = (v: Viewport) => (vps?.[v] ? '✓' : '·');
      if (!vps) {
        const status = BACKEND_ONLY_BLOCKS.includes(block) ? '⊘ backend-only' : '❓ design pending';
        reportLines.push(`| **${block}** | · | · | · | ${configs[block].variants.join(', ') || '—'} | ${status} |`);
        continue;
      }
      // Aggregate variant hints across viewports
      const allHints = new Set<string>();
      for (const vp of ['1920', '1280', '375'] as Viewport[]) {
        const feat = featuresByKey.get(`${themeId}:${block}:${vp}`);
        if (!feat) continue;
        feat.variantHints.forEach((h) => allHints.add(h));
      }
      const hints = [...allHints].join('; ') || '—';
      reportLines.push(
        `| **${block}** | ${cell('1920')} | ${cell('1280')} | ${cell('375')} | ${configs[block].variants.join(', ') || '—'} | ${hints} |`,
      );
    }
    reportLines.push('');

    // Per-block detail section
    reportLines.push(`### Details — ${themeId}`);
    reportLines.push('');
    for (const block of BLOCK_WHITELIST) {
      const vps = theme.blocks[block];
      if (!vps) continue;
      reportLines.push(`#### ${block}`);
      reportLines.push('');

      const config = configs[block];
      if (config.hasFile) {
        reportLines.push(
          `- **Code props:** ${config.propNames.join(', ') || '—'}`,
        );
        if (config.variants.length > 0) {
          reportLines.push(`- **Code variants:** \`${config.variants.join('\`, \`')}\``);
        }
      } else {
        reportLines.push(`- **Code:** no \`${block}.puckConfig.ts\` found.`);
      }

      for (const vp of ['1920', '1280', '375'] as Viewport[]) {
        const entry = vps[vp];
        if (!entry) continue;
        const feat = featuresByKey.get(`${themeId}:${block}:${vp}`);
        reportLines.push('');
        reportLines.push(`**@ ${vp}:** \`${entry.nodeId}\` (${entry.bbox?.w ?? '?'}×${entry.bbox?.h ?? '?'}) — *${entry.name}*`);
        if (feat) {
          reportLines.push('');
          reportLines.push(
            `- Layout: ${feat.layoutMode} · children: ${feat.childCount} · images: ${feat.imageCount} · texts: ${feat.textCount} · CTAs: ${feat.ctaCount}`,
          );
          if (feat.primaryFillHex) reportLines.push(`- Primary fill: \`${feat.primaryFillHex}\``);
          if (feat.primaryFontFamily) reportLines.push(`- Primary font: \`${feat.primaryFontFamily}\``);
          if (feat.typographyScale && feat.typographyScale.length > 0)
            reportLines.push(`- Font sizes: ${feat.typographyScale.join(', ')} px`);
          if (feat.cornerRadii.length > 0)
            reportLines.push(`- Corner radii: ${feat.cornerRadii.join(', ')} px`);
          if (feat.variantHints.length > 0)
            reportLines.push(`- Variant hints: **${feat.variantHints.join('**, **')}**`);
        }
      }
      reportLines.push('');
    }

    // Unmapped (top 10 by bbox size)
    if (theme.unmapped.length > 0) {
      const top = theme.unmapped
        .slice()
        .sort((a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h)
        .slice(0, 10);
      reportLines.push(`### Unmapped frames in ${themeId} (top 10 by size, total ${theme.unmapped.length})`);
      reportLines.push('');
      reportLines.push('| Figma name | nodeId | size | reason |');
      reportLines.push('|------------|--------|------|--------|');
      for (const u of top) {
        reportLines.push(
          `| \`${u.name}\` | \`${u.nodeId}\` | ${u.bbox.w}×${u.bbox.h} | ${u.reason} |`,
        );
      }
      reportLines.push('');
    }

    reportLines.push('');
    reportLines.push('---');
    reportLines.push('');
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, reportLines.join('\n') + '\n');
  console.log(`\n💾 wrote ${REPORT_PATH}`);

  // Gap summary — deduplicate across themes
  const gapLines: string[] = [];
  gapLines.push(`# Block Gap Summary — Phase 2c → input for Phase 2d`);
  gapLines.push('');
  gapLines.push(`**Generated:** ${new Date().toISOString()}`);
  gapLines.push('');
  gapLines.push(
    `This is the de-duplicated list of block gaps — every unique variant hint that appears ` +
      `in Figma but is **not a known variant in code**. Each gap is a suggested task for Phase 2d.`,
  );
  gapLines.push('');

  // Collect all hints per block, compare to code variants
  const blockToHints = new Map<BlockName, Map<string, Set<string>>>();
  for (const [key, feat] of featuresByKey) {
    const [themeId, block] = key.split(':') as [ThemeId, BlockName];
    for (const hint of feat.variantHints) {
      if (!blockToHints.has(block)) blockToHints.set(block, new Map());
      const hintMap = blockToHints.get(block)!;
      if (!hintMap.has(hint)) hintMap.set(hint, new Set());
      hintMap.get(hint)!.add(themeId);
    }
  }

  for (const block of BLOCK_WHITELIST) {
    const hints = blockToHints.get(block);
    if (!hints || hints.size === 0) continue;
    const codeVariants = new Set(configs[block].variants);

    gapLines.push(`## ${block}`);
    gapLines.push('');
    gapLines.push(`**Code variants today:** ${[...codeVariants].join(', ') || '—'}`);
    gapLines.push('');
    gapLines.push('| Figma hint | Themes | Likely action |');
    gapLines.push('|------------|--------|---------------|');
    for (const [hint, themes] of hints) {
      let action = 'review — is this expressible via existing variants/props?';
      if (hint.includes('multi-image')) action = 'Add `images: string[]` prop (array) + variant';
      if (hint.includes('grid-')) action = `Add variant with ${hint} layout`;
      if (hint.includes('pill')) action = 'Add style-layer override or variant with radius≥60 for CTAs';
      if (hint.includes('flat')) action = 'Add style-layer override for radius=0 elements';
      if (hint.includes('has-form')) action = 'Ensure block supports embedded form fields (Newsletter/ContactForm variants)';
      const themesList = [...themes].sort().join(', ');
      gapLines.push(`| ${hint} | ${themesList} | ${action} |`);
    }
    gapLines.push('');
  }

  // Missing backend-only blocks note
  gapLines.push(`## Intentionally not in Figma (no gap)`);
  gapLines.push('');
  gapLines.push(`These blocks are runtime/backend-only and rarely rendered in Figma:`);
  gapLines.push('');
  gapLines.push(BACKEND_ONLY_BLOCKS.map((b) => `- \`${b}\``).join('\n'));
  gapLines.push('');

  // Design-pending blocks (in whitelist but not in Figma and not backend-only)
  gapLines.push(`## Design-pending blocks (missing in Figma, not backend-only)`);
  gapLines.push('');
  gapLines.push(`| Block | Missing in themes | Action |`);
  gapLines.push(`|-------|-------------------|--------|`);
  for (const block of BLOCK_WHITELIST) {
    if (BACKEND_ONLY_BLOCKS.includes(block)) continue;
    const missingIn = THEME_IDS.filter((tid) =>
      inventory.themes[tid].missingBlocks.includes(block),
    );
    if (missingIn.length === THEME_IDS.length) {
      gapLines.push(
        `| \`${block}\` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |`,
      );
    } else if (missingIn.length > 0) {
      gapLines.push(
        `| \`${block}\` | ${missingIn.join(', ')} | Partial coverage — OK if optional, else design-pending for missing themes |`,
      );
    }
  }
  gapLines.push('');

  writeFileSync(GAP_PATH, gapLines.join('\n') + '\n');
  console.log(`💾 wrote ${GAP_PATH}`);

  // Console summary
  console.log(`\n📊 Summary`);
  console.log(`   Figma → code coverage:`);
  for (const tid of THEME_IDS) {
    const theme = inventory.themes[tid];
    const have = Object.keys(theme.blocks).length;
    const need = BLOCK_WHITELIST.length - BACKEND_ONLY_BLOCKS.length;
    const pct = Math.round((have / need) * 100);
    console.log(`     ${tid.padEnd(7)} ${have}/${need} (${pct}%) blocks`);
  }
  const totalHints = [...blockToHints.values()].reduce((a, m) => a + m.size, 0);
  console.log(`   ${totalHints} unique variant hints → potential Phase 2d tasks`);
}

main().catch((err) => {
  console.error(`\n❌ figma:audit failed:`, err);
  process.exit(1);
});
