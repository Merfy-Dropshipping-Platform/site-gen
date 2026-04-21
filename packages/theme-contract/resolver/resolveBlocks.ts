export interface BaseBlockEntry {
  source: 'base';
  path: string;
}

export interface ResolvedBlockEntry {
  source: 'base' | 'theme' | 'custom';
  path: string;
  variant?: string;
}

export interface ThemeConfigForResolver {
  blocks: Record<string, { override?: { path: string; reason: string } } | { variant?: string; constraints?: unknown }>;
  features: Record<string, boolean>;
  customBlocks?: Record<string, { path: string; requiredFeatures?: string[] }>;
}

export function resolveBlocks(
  baseBlocks: Record<string, BaseBlockEntry>,
  theme: ThemeConfigForResolver,
): Record<string, ResolvedBlockEntry> {
  const out: Record<string, ResolvedBlockEntry> = {};

  // Start from base
  for (const [name, def] of Object.entries(baseBlocks)) {
    out[name] = { source: 'base', path: def.path };
  }

  // Apply theme modifications
  for (const [name, cfg] of Object.entries(theme.blocks)) {
    if ('override' in cfg && cfg.override) {
      out[name] = { source: 'theme', path: cfg.override.path };
    } else if ('variant' in cfg && cfg.variant) {
      if (out[name]) {
        out[name] = { ...out[name], variant: cfg.variant };
      }
    }
  }

  // Include custom blocks (filtered by features)
  for (const [name, cfg] of Object.entries(theme.customBlocks ?? {})) {
    const required = cfg.requiredFeatures ?? [];
    const allPresent = required.every(f => theme.features[f] === true);
    if (required.length === 0 || allPresent) {
      out[name] = { source: 'custom', path: cfg.path };
    }
  }

  return out;
}
