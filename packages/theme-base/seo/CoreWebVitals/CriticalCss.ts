/**
 * Stub for Phase 1b — real critical CSS extraction in Phase 1c/2.
 */

export interface CriticalCssOptions {
  html: string;
  css: string;
  viewport?: { width: number; height: number };
}

export interface CriticalCssResult {
  critical: string;
  deferred: string;
}

export function extractCriticalCss(opts: CriticalCssOptions): CriticalCssResult {
  // Phase 1b: return all CSS as critical (conservative). Phase 1c: integrate `critical` or `penthouse` package.
  return {
    critical: opts.css,
    deferred: '',
  };
}
