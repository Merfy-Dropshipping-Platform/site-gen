#!/usr/bin/env node
/**
 * Child-process compiled-module import checker for the conformance source
 * snapshot. jest (CJS, no --experimental-vm-modules) cannot import the compiled
 * ESM `.mjs` (astro runtime) in-process, so source-snapshot.ts spawns THIS
 * script.
 *
 * Input:  argv[2] = JSON array of absolute .mjs paths.
 * Output: JSON array of { path, exists, defaultExport, namedExports[], failure? }.
 *         A renderer succeeds on a REAL `default` export ({} import = failure);
 *         a Puck-index config module succeeds on its named exports. The snapshot
 *         picks the right criterion per module kind.
 */
import { existsSync } from 'node:fs';

async function main() {
  const paths = JSON.parse(process.argv[2] ?? '[]');
  const out = [];
  for (const p of paths) {
    if (!existsSync(p)) {
      out.push({
        path: p,
        exists: false,
        defaultExport: false,
        namedExports: [],
        failure: 'missing',
      });
      continue;
    }
    try {
      const mod = await import(p);
      const isObj = mod && typeof mod === 'object';
      const hasDefault = isObj && mod.default !== undefined;
      const namedExports = isObj
        ? Object.keys(mod).filter((k) => k !== 'default').sort()
        : [];
      const record = { path: p, exists: true, defaultExport: hasDefault, namedExports };
      // A module with neither a default nor any named export is an empty import.
      if (!hasDefault && namedExports.length === 0) record.failure = 'no-default';
      out.push(record);
    } catch {
      out.push({
        path: p,
        exists: true,
        defaultExport: false,
        namedExports: [],
        failure: 'import-error',
      });
    }
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
