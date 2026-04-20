import type { ResolvedBlockEntry } from './resolveBlocks';

export interface PuckComponentConfig {
  label: string;
  fields: Record<string, unknown>;
  defaultProps: unknown;
  render: (...args: unknown[]) => unknown;
}

export interface PuckCategories {
  [category: string]: { components: string[] };
}

export interface PuckConfigResult {
  components: Record<string, PuckComponentConfig>;
  categories?: PuckCategories;
}

/** Placeholder render function — real React component injected by constructor in Phase 1. */
const placeholderRender = () => null;

export type BlockConfigLoader = (path: string) => Promise<Record<string, unknown>>;

export async function resolveConstructorConfig(
  resolvedBlocks: Record<string, ResolvedBlockEntry>,
  loader: BlockConfigLoader,
): Promise<PuckConfigResult> {
  const components: Record<string, PuckComponentConfig> = {};
  const categories: PuckCategories = {};

  for (const [name, entry] of Object.entries(resolvedBlocks)) {
    const mod = await loader(entry.path);

    // Convention: each block index exports `<Name>PuckConfig`
    const configKey = `${name}PuckConfig`;
    const cfg = mod[configKey] as { label: string; category: string; fields: Record<string, unknown>; defaults: unknown } | undefined;
    if (!cfg) {
      throw new Error(`Block "${name}" at ${entry.path} does not export ${configKey}`);
    }

    components[name] = {
      label: cfg.label,
      fields: cfg.fields,
      defaultProps: cfg.defaults,
      render: placeholderRender,
    };

    const cat = cfg.category || 'other';
    if (!categories[cat]) categories[cat] = { components: [] };
    categories[cat].components.push(name);
  }

  return { components, categories };
}
