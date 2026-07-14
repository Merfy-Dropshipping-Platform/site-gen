#!/usr/bin/env node
/**
 * Child-process probe for the compiled Satin MultiColumns block contract.
 *
 * jest (ts-jest ESM) cannot `import()` the compiled `.mjs` artifact in-process
 * (jest-resolve rejects the file:// URL), so
 * satin-conformance-multicolumns-contract.spec.ts spawns THIS script. It imports
 * the ACTUAL compiled block puckConfig, runs the real zod `safeParse` and prints
 * the observed contract facts as JSON — never a source-string assertion against
 * the type-broken raw source.
 *
 * Usage: node render-satin-multicolumns.mjs '<inputJson>'
 * Prints one JSON object of observed facts to stdout.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const COMPILED = resolve(
  SITES_ROOT,
  'dist',
  'astro-blocks',
  'theme-satin__MultiColumns__MultiColumns.puckConfig.mjs',
);

async function main() {
  const input = JSON.parse(process.argv[2] ?? '{}');
  const mod = await import(pathToFileURL(COMPILED).href);
  const schema = mod.MultiColumnsSchema;
  const config = mod.MultiColumnsPuckConfig;

  const parsed = schema.safeParse(input);
  const col0 =
    parsed.success && Array.isArray(parsed.data.columns) ? parsed.data.columns[0] ?? {} : {};

  // A top-level probe: does the schema strip a field-only key (containerEnabled)?
  const topProbe = schema.safeParse({ ...input, containerEnabled: 'true' });
  const topKeysHaveContainerEnabled =
    topProbe.success && 'containerEnabled' in (topProbe.data ?? {});

  // Nested/union/leaf drift the SHALLOW top-level regex sidebar guard cannot see.
  // A column with a nested `link` object + a heading given as an OBJECT (the
  // union branch) exercises depth the shallow field-type map never inspects.
  const nestedProbe = schema.safeParse({
    heading: { text: 'Nested', alignment: 'center', size: 'large' },
    columns: [
      {
        id: 'n',
        title: 'T',
        link: { text: 'More', href: '/x', bogusLeaf: 'z' },
        headingSize: 'large',
      },
    ],
    displayColumns: 2,
    padding: { top: 0, bottom: 0 },
  });
  const nestedCol =
    nestedProbe.success && Array.isArray(nestedProbe.data.columns)
      ? nestedProbe.data.columns[0] ?? {}
      : {};
  const nestedLink =
    nestedCol && typeof nestedCol.link === 'object' && nestedCol.link ? nestedCol.link : {};
  const headingIsObject =
    nestedProbe.success && nestedProbe.data.heading && typeof nestedProbe.data.heading === 'object';

  // An INVALID enum option must be rejected by the schema (options are enforced
  // at depth, not merely by top-level field type).
  const invalidEnum = schema.safeParse({
    heading: 'H',
    columns: [{ id: 'a', headingSize: 'gigantic' }],
    displayColumns: 3,
    padding: { top: 0, bottom: 0 },
  });

  const out = {
    fieldKeys: Object.keys(config.fields).sort(),
    parseSuccess: parsed.success,
    colKeys: Object.keys(col0).sort(),
    colHasBothHeadingTitle: 'heading' in col0 && 'title' in col0,
    colHasBothImageUrlImage: 'imageUrl' in col0 && 'image' in col0,
    colHasBothTextDescription: 'text' in col0 && 'description' in col0,
    outOfSchemaLeafStripped: !('outOfSchemaLeaf' in col0),
    headingValue: col0.heading ?? null,
    titleValue: col0.title ?? null,
    topContainerEnabledStripped: !topKeysHaveContainerEnabled,
    // recursive-drift observations (shallow top-level guard is blind to these):
    nestedParseSuccess: nestedProbe.success,
    nestedLinkKeys: Object.keys(nestedLink).sort(),
    nestedLinkBogusLeafStripped: !('bogusLeaf' in nestedLink),
    headingUnionAcceptsObject: Boolean(headingIsObject),
    invalidEnumRejected: !invalidEnum.success,
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
