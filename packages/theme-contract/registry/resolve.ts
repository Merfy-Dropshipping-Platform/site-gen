/**
 * Shared import resolver — переписывает `./X` (sibling) и `../../runtime/X`
 * imports в плоский layout dist/astro-blocks/<pkg>__<block>__<name>.mjs.
 *
 * Используется как в preview compile (compile-astro-blocks.mjs) так и
 * (потенциально) в live build resolver. Один code path = drift невозможен.
 */
export interface ResolveOpts {
  /** Package name, e.g. 'theme-base' */
  pkg: string;
  /** Block name, e.g. 'Hero' (или 'layouts__StoreLayout' для non-block entries) */
  blockName: string;
  /** Output naming mode: flat (compile-blocks) or tree (assembleFromPackages) */
  mode: 'flat' | 'tree';
}

export interface ResolveResult {
  rewritten: string;
  deps: string[];
}

export function resolveImports(source: string, opts: ResolveOpts): ResolveResult {
  const deps: string[] = [];
  let rewritten = source;

  // ./X (sibling) — flat layout only (tree leaves imports as-is)
  if (opts.mode === 'flat') {
    rewritten = rewritten.replace(
      /(from\s+['"])(\.\/)([A-Za-z0-9_.-]+?)(\.ts)?(['"])/g,
      (match, prefix, _dot, modName, _tsExt, suffix) => {
        if (modName.endsWith('.json') || modName.endsWith('.css') || modName.endsWith('.mjs')) {
          return match;
        }
        if (modName.endsWith('.astro')) {
          const bare = modName.replace(/\.astro$/, '');
          const catMatch = /^([a-z]+__)/i.exec(opts.blockName);
          const flat = catMatch
            ? `${opts.pkg}__${catMatch[1]}${bare}.mjs`
            : `${opts.pkg}__${opts.blockName}__${bare}.mjs`;
          deps.push(flat);
          return `${prefix}./${flat}${suffix}`;
        }
        const flat = `${opts.pkg}__${opts.blockName}__${modName}.mjs`;
        deps.push(flat);
        return `${prefix}./${flat}${suffix}`;
      },
    );

    // ../../runtime/X — flat layout, shared runtime files
    rewritten = rewritten.replace(
      /(from\s+['"])(\.\.\/\.\.\/runtime\/)([A-Za-z0-9_.-]+?)(\.ts)?(['"])/g,
      (_match, prefix, _dots, modName, _tsExt, suffix) => {
        const flat = `runtime__${modName}.mjs`;
        deps.push(flat);
        return `${prefix}./${flat}${suffix}`;
      },
    );
  }

  return { rewritten, deps };
}
