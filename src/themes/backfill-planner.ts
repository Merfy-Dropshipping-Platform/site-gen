/**
 * Pure planner for the Phase 0b back-fill migration. Given a batch of
 * (revision id, site.theme_id, data) tuples, decides which revisions
 * should have their `themeSettings.colorSchemes` rewritten to match the
 * site's theme manifest.
 *
 * Extracted from the runner script so the decision logic is fully
 * testable without touching a database.
 */

import { isLegacySeed } from './legacy-seed-schemes';
import {
  themeToMerchantColorSchemes,
  type MerchantSchemeShape,
} from './theme-manifest-loader';

export interface RevisionRow {
  id: string;
  siteThemeId: string | null;
  data: Record<string, unknown>;
}

export type PlanAction =
  | 'rewrite'
  | 'skip-customised'
  | 'skip-no-theme'
  | 'skip-no-schemes'
  | 'skip-no-theme-schemes';

export interface Plan {
  rowId: string;
  action: PlanAction;
  themeId: string | null;
  newSchemes?: MerchantSchemeShape[];
}

export function planRewrites(rows: readonly RevisionRow[]): Plan[] {
  return rows.map((row) => {
    const themeId = row.siteThemeId;
    if (!themeId) {
      return { rowId: row.id, action: 'skip-no-theme', themeId: null };
    }

    const ts = (row.data?.themeSettings ?? {}) as Record<string, unknown>;
    const existing = ts.colorSchemes;
    if (!Array.isArray(existing)) {
      return { rowId: row.id, action: 'skip-no-schemes', themeId };
    }

    if (!isLegacySeed(existing)) {
      return { rowId: row.id, action: 'skip-customised', themeId };
    }

    const newSchemes = themeToMerchantColorSchemes(themeId);
    if (newSchemes.length === 0) {
      return { rowId: row.id, action: 'skip-no-theme-schemes', themeId };
    }

    return { rowId: row.id, action: 'rewrite', themeId, newSchemes };
  });
}
