export interface BlockData {
  type: string;
  props: Record<string, unknown>;
}

export interface BlockMigrationsForTheme {
  [blockName: string]: {
    from: {
      [sourceThemeOrStar: string]: { [sourceField: string]: string };
    };
  };
}

export interface MigrationRun {
  fromTheme: string;
  migrations: BlockMigrationsForTheme;
  /** defaults per block name */
  defaults: Record<string, Record<string, unknown>>;
}

export interface MigrationReport {
  migrated: Array<{ block: string; from: string; to: string; value: unknown }>;
  reset: Array<{ block: string; field: string; value: unknown }>;
  warnings: string[];
}

export interface MigrationResult {
  migrated: BlockData[];
  report: MigrationReport;
}

export function applyMigrations(blocks: BlockData[], run: MigrationRun): MigrationResult {
  const report: MigrationReport = { migrated: [], reset: [], warnings: [] };
  const out: BlockData[] = [];

  for (const block of blocks) {
    const rule = run.migrations[block.type];
    const blockDefaults = run.defaults[block.type] ?? {};

    if (!rule) {
      // No migration rule — copy block as-is
      out.push({ ...block, props: { ...block.props } });
      continue;
    }

    const fromMap = rule.from[run.fromTheme] ?? rule.from['*'] ?? {};

    const newProps: Record<string, unknown> = {};

    // 1. Apply mappings from source → destination
    for (const [srcField, dstField] of Object.entries(fromMap)) {
      if (srcField in block.props) {
        newProps[dstField] = block.props[srcField];
        report.migrated.push({ block: block.type, from: srcField, to: dstField, value: block.props[srcField] });
      }
    }

    // 2. Copy through fields that are present in both old and new (same name)
    for (const [key, val] of Object.entries(block.props)) {
      if (key in blockDefaults && !(key in fromMap) && !(key in newProps)) {
        newProps[key] = val;
      }
    }

    // 3. Fill missing defaults
    for (const [key, defaultVal] of Object.entries(blockDefaults)) {
      if (!(key in newProps)) {
        newProps[key] = defaultVal;
        report.reset.push({ block: block.type, field: key, value: defaultVal });
      }
    }

    out.push({ type: block.type, props: newProps });
  }

  return { migrated: out, report };
}
