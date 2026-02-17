/**
 * buildPuckConfig -- converts a theme's ComponentRegistryEntry array
 * into a Puck ComponentConfig object.
 *
 * This is the bridge between the theme registry format and @measured/puck
 * (or @puckeditor/core) Config.
 */

export interface RegistryEntry {
  name: string;
  label: string;
  category: string;
  schema: Record<string, FieldDef>;
  puckConfig?: Record<string, unknown>;
  defaultProps?: Record<string, unknown>;
}

export interface FieldDef {
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'radio'
    | 'color'
    | 'custom'
    | 'external'
    | 'object'
    | 'array';
  label?: string;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  objectFields?: Record<string, FieldDef>;
  arrayFields?: Record<string, FieldDef>;
  getItemSummary?: (item: unknown) => string;
}

/**
 * Minimal subset of Puck types we need, avoiding hard runtime dependency
 * on @measured/puck for environments that only use the config builder.
 */
export interface PuckFieldConfig {
  type: string;
  label?: string;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  objectFields?: Record<string, PuckFieldConfig>;
  arrayFields?: Record<string, PuckFieldConfig>;
  getItemSummary?: (item: unknown) => string;
}

export interface PuckComponentConfig {
  label?: string;
  fields?: Record<string, PuckFieldConfig>;
  defaultProps?: Record<string, unknown>;
  render?: (...args: unknown[]) => unknown;
}

export interface PuckConfig {
  components: Record<string, PuckComponentConfig>;
  root: {
    fields: Record<string, PuckFieldConfig>;
    render: (props: { children: unknown }) => unknown;
  };
}

/**
 * Build a Puck-compatible Config from a list of RegistryEntry descriptors.
 *
 * @param registry  The theme component registry
 * @param features  Optional feature flags map -- entries whose
 *                  `puckConfig.requiredFeature` is absent from this map
 *                  (or set to false) will be excluded.
 */
export function buildPuckConfig(
  registry: RegistryEntry[],
  features?: Record<string, boolean>,
): PuckConfig {
  const components: Record<string, PuckComponentConfig> = {};

  for (const entry of registry) {
    // Feature-gate: skip components whose required feature is not enabled.
    if (entry.puckConfig?.requiredFeature) {
      const feat = entry.puckConfig.requiredFeature as string;
      if (!features || !features[feat]) continue;
    }

    const fields: Record<string, PuckFieldConfig> = {};
    for (const [key, fieldDef] of Object.entries(entry.schema)) {
      fields[key] = convertField(fieldDef);
    }

    components[entry.name] = {
      label: entry.label,
      fields,
      defaultProps: entry.defaultProps ?? {},
      ...(entry.puckConfig?.render
        ? { render: entry.puckConfig.render as (...args: unknown[]) => unknown }
        : {}),
    };
  }

  return {
    components,
    root: {
      fields: {},
      render: ({ children }: { children: unknown }) => children,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function convertField(def: FieldDef): PuckFieldConfig {
  switch (def.type) {
    case 'text':
    case 'textarea':
    case 'number':
    case 'color':
    case 'radio':
    case 'select':
      return {
        type: def.type,
        label: def.label,
        ...(def.options ? { options: def.options } : {}),
        ...(def.min !== undefined ? { min: def.min } : {}),
        ...(def.max !== undefined ? { max: def.max } : {}),
      };

    case 'object':
      return {
        type: 'object',
        label: def.label,
        objectFields: def.objectFields
          ? Object.fromEntries(
              Object.entries(def.objectFields).map(([k, v]) => [
                k,
                convertField(v),
              ]),
            )
          : {},
      };

    case 'array':
      return {
        type: 'array',
        label: def.label,
        arrayFields: def.arrayFields
          ? Object.fromEntries(
              Object.entries(def.arrayFields).map(([k, v]) => [
                k,
                convertField(v),
              ]),
            )
          : {},
        getItemSummary: def.getItemSummary,
      };

    case 'external':
      return {
        type: 'external',
        label: def.label,
      };

    default:
      // Unknown/custom types fall back to text
      return { type: 'text', label: def.label };
  }
}
