#!/usr/bin/env tsx
/**
 * figma:snapshot — download block screenshots + variables to local dev folder.
 * Output: docs/figma-snapshots/<theme>/  (GITIGNORED — personal dev workspace)
 *
 * Usage:
 *   pnpm figma:snapshot --theme rose
 *   pnpm figma:snapshot --all
 *   pnpm figma:snapshot --theme vanila --viewport 1920
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DEFAULT_FILE_KEY, loadEnv, requireEnv } from './lib/env.js';
import { FigmaRestClient } from './lib/rest-client.js';
import type {
  FigmaInventory,
  ThemeId,
  Viewport,
} from './lib/types.js';
import { THEME_IDS } from './lib/types.js';

loadEnv();

interface Args {
  theme?: ThemeId;
  viewport?: Viewport;
  all?: boolean;
  skipVariables?: boolean;
}

function parseArgs(): Args {
  const args: Args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--theme') args.theme = argv[++i] as ThemeId;
    else if (a === '--viewport') args.viewport = argv[++i] as Viewport;
    else if (a === '--skip-variables') args.skipVariables = true;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: pnpm figma:snapshot [--theme <id>|--all] [--viewport 1920|1280|375]`);
      process.exit(0);
    }
  }
  if (!args.theme && !args.all) {
    console.error('Must specify --theme <id> or --all');
    process.exit(2);
  }
  return args;
}

const INVENTORY_PATH = resolve(process.cwd(), 'docs/078-theme-system/figma-inventory.json');
const OUT_ROOT = resolve(process.cwd(), 'docs/figma-snapshots');

async function main() {
  const args = parseArgs();
  const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as FigmaInventory;

  const apiKey = requireEnv('FIGMA_API_KEY');
  const client = new FigmaRestClient({ apiKey, fileKey: inventory.fileKey });

  const themeIds = args.all ? THEME_IDS : [args.theme!];
  console.log(`\n📥 figma:snapshot`);
  console.log(`   themes: ${themeIds.join(', ')}`);
  if (args.viewport) console.log(`   viewport filter: ${args.viewport}`);

  for (const themeId of themeIds) {
    const theme = inventory.themes[themeId];
    const outDir = resolve(OUT_ROOT, themeId);
    mkdirSync(outDir, { recursive: true });
    console.log(`\n  → ${themeId}  (${outDir})`);

    // Collect (nodeId, block, viewport) list
    const targets: { nodeId: string; block: string; viewport: Viewport }[] = [];
    for (const [block, vps] of Object.entries(theme.blocks)) {
      if (!vps) continue;
      for (const [vp, entry] of Object.entries(vps)) {
        if (!entry) continue;
        if (args.viewport && vp !== args.viewport) continue;
        targets.push({ nodeId: entry.nodeId, block, viewport: vp as Viewport });
      }
    }
    if (targets.length === 0) {
      console.log(`     (no matching targets)`);
      continue;
    }

    console.log(`     ${targets.length} blocks to download`);

    // Some Figma frames are huge (24000+px) — /images rejects big batches with
    // "Render timeout". Request each id individually so one slow frame doesn't
    // take down siblings, and downscale scale=1 to stay under limits.
    let saved = 0;
    for (const t of targets) {
      try {
        const imagesRes = await client.getImages([t.nodeId], { scale: 1, format: 'png' });
        if (imagesRes.err) {
          console.log(`     ⚠ ${t.block}-${t.viewport}: ${imagesRes.err}`);
          continue;
        }
        const url = imagesRes.images[t.nodeId];
        if (!url) {
          console.log(`     ⚠ ${t.block}-${t.viewport}: no URL in response`);
          continue;
        }
        const buf = await client.downloadImage(url);
        const filename = `${t.block}-${t.viewport}.png`;
        writeFileSync(resolve(outDir, filename), buf);
        saved++;
        process.stdout.write(`     ${saved}/${targets.length}\r`);
      } catch (err) {
        console.log(`\n     ⚠ ${t.block}-${t.viewport}: ${(err as Error).message.slice(0, 100)}`);
      }
    }
    console.log(`\n     💾 saved ${saved}/${targets.length} PNGs`);

    // Variables (simplified — dump raw JSON; developer can inspect)
    if (!args.skipVariables) {
      try {
        const vars = await client.getVariableCollections();
        writeFileSync(
          resolve(outDir, 'variables.json'),
          JSON.stringify(vars, null, 2),
        );
        console.log(`     💾 saved variables.json`);
      } catch (err) {
        // Starter plan may not expose full vars — that's OK, log silently
        console.log(`     (variables unavailable: ${(err as Error).message.slice(0, 80)})`);
      }
    }
  }

  console.log(
    `\n✅ Snapshot complete. Files in docs/figma-snapshots/ (gitignored — open next to constructor during Phase 2e preset building).\n`,
  );
}

main().catch((err) => {
  console.error(`\n❌ figma:snapshot failed:`, err);
  process.exit(1);
});
