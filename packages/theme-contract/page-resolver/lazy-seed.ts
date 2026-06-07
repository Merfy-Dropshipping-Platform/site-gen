import { promises as fs } from 'fs';
import * as path from 'path';
import type { PuckData } from './types';

export interface LazySeedOptions {
  /** Map themeId → absolute filesystem path of theme package root. */
  themePackageRoots: Record<string, string>;
}

export class LazySeed {
  private cache = new Map<string, PuckData>();

  constructor(private readonly opts: LazySeedOptions) {}

  async loadContent(themeId: string, contentFile: string): Promise<PuckData> {
    const cacheKey = `${themeId}::${contentFile}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const root = this.opts.themePackageRoots[themeId];
    if (!root) throw new Error(`Unknown theme: ${themeId}`);

    const filePath = path.join(root, contentFile);
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as PuckData;
    this.cache.set(cacheKey, parsed);
    return parsed;
  }

  /** Test helper — drop cache. */
  invalidate(): void {
    this.cache.clear();
  }
}
