import { promises as fs } from 'fs';
import * as path from 'path';
import type { PuckData } from './types';

export interface LazySeedOptions {
  /** Map themeId → absolute filesystem path of theme package root. */
  themePackageRoots: Record<string, string>;
}

/**
 * Lazy loader for theme default page content. Called by `PageResolver` when
 * `revision.pagesData[pageId]` is missing (legacy revisions) — reads
 * `pages/<id>.json` from the theme package on disk, caches in-memory for
 * the process lifetime. Theme files are immutable per deploy, so cache
 * never needs invalidation outside tests.
 */
export class LazySeed {
  private cache = new Map<string, PuckData>();

  constructor(private readonly opts: LazySeedOptions) {}

  /**
   * Load page content file from a theme package.
   *
   * `contentFile` is theme-authored (declared in `theme.json` manifest), NOT
   * user input — path traversal protection не нужен. If `contentFile` ever
   * becomes user-derived, sanitize at the boundary.
   *
   * NB: concurrent calls for the same key may both miss the cache and both
   * read the file (race tolerated — fs.readFile is idempotent, second cache
   * write overwrites with structurally-equal object).
   *
   * @throws if `themeId` not registered, file missing, or content invalid JSON.
   */
  async loadContent(themeId: string, contentFile: string): Promise<PuckData> {
    const cacheKey = `${themeId}::${contentFile}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const root = this.opts.themePackageRoots[themeId];
    if (!root) throw new Error(`Unknown theme: ${themeId}`);

    const filePath = path.join(root, contentFile);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      throw new Error(
        `LazySeed: failed to read content file for theme "${themeId}" (${contentFile}): ${(err as Error).message}`,
      );
    }
    let parsed: PuckData;
    try {
      parsed = JSON.parse(raw) as PuckData;
    } catch (err) {
      throw new Error(
        `LazySeed: failed to parse JSON for theme "${themeId}" (${contentFile}): ${(err as Error).message}`,
      );
    }
    // TODO(Task 9): validate parsed against PuckData schema via validators.ts.
    this.cache.set(cacheKey, parsed);
    return parsed;
  }

  /** Test helper — drop cache. */
  invalidate(): void {
    this.cache.clear();
  }
}
